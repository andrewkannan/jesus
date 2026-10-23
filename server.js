require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Global State
let globalState = {
  level: 0,
  db: 0,
  peak: 0,
  average: 0,
  stage: 0, // 0: Group 1, 1: Group 2, 2: Group 3, 3: Group 4, 4: Finale Word ("NOTHING IS IMPOSSIBLE WITH GOD")
  finalWin: false,
  curtainOpen: false,
  status: 'idle',
  manualOverride: false,
  reset: false,
  stageChanged: false,
  updatedAt: Date.now()
};

const REMOTE_PIN = (process.env.REMOTE_PIN || 'JESUS').trim().toUpperCase();

// Middleware to parse JSON bodies and serve fresh static files without stale browser cache
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Authentication endpoint for the remote
app.post('/api/auth', (req, res) => {
  const pin = (req.body && req.body.pin ? String(req.body.pin) : '').trim().toUpperCase();
  if (pin === REMOTE_PIN) {
    res.json({ success: true, state: globalState });
  } else {
    res.status(401).json({ success: false, message: 'Invalid PIN' });
  }
});

// Serve remote html
app.get('/remote', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'remote.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Send the current state immediately upon connection
  socket.emit('state_update', globalState);

  socket.on('remote_update', (data) => {
    if (!data || String(data.pin || '').trim().toUpperCase() !== REMOTE_PIN) {
        return;
    }

    const nextStage = typeof data.stage === 'number' ? Math.max(0, Math.min(4, data.stage)) : globalState.stage;
    const stageChanged = nextStage !== globalState.stage;

    // Update global state
    globalState = {
      ...globalState,
      level: typeof data.level === 'number' ? data.level : globalState.level,
      db: typeof data.db === 'number' ? data.db : globalState.db,
      peak: typeof data.peak === 'number' ? data.peak : globalState.peak,
      average: typeof data.average === 'number' ? data.average : globalState.average,
      stage: nextStage,
      finalWin: typeof data.finalWin === 'boolean' ? data.finalWin : globalState.finalWin,
      curtainOpen: typeof data.curtainOpen === 'boolean' ? data.curtainOpen : globalState.curtainOpen,
      status: data.status || globalState.status,
      manualOverride: typeof data.manualOverride === 'boolean' ? data.manualOverride : globalState.manualOverride,
      reset: false,
      stageChanged: stageChanged,
      updatedAt: Date.now()
    };
    
    // Broadcast to display clients
    io.emit('state_update', globalState);
  });
  
  socket.on('command', (data) => {
     if (!data || String(data.pin || '').trim().toUpperCase() !== REMOTE_PIN) return;
     
     if (data.command === 'reset') {
         globalState = {
           level: 0,
           db: 0,
           peak: 0,
           average: 0,
           stage: 0,
           finalWin: false,
           curtainOpen: false,
           status: 'idle',
           manualOverride: false,
           reset: true,
           stageChanged: true,
           updatedAt: Date.now()
         };
         io.emit('state_update', globalState);
     } else if (data.command === 'curtain') {
         globalState = {
           ...globalState,
           curtainOpen: Boolean(data.open),
           reset: false,
           stageChanged: false,
           updatedAt: Date.now()
         };
         io.emit('state_update', globalState);
     } else if (data.command === 'set_stage' && typeof data.stage === 'number') {
         const targetStage = Math.max(0, Math.min(4, data.stage));
         globalState = {
           ...globalState,
           level: 0,
           db: 0,
           peak: 0,
           average: 0,
           stage: targetStage,
           finalWin: false,
           manualOverride: false,
           reset: false,
           stageChanged: true,
           updatedAt: Date.now()
         };
         io.emit('state_update', globalState);
     } else if (data.command === 'final_win') {
         globalState = {
           ...globalState,
           stage: 4,
           level: 100,
           db: Math.max(globalState.db, 125),
           peak: Math.max(globalState.peak, 125),
           finalWin: true,
           curtainOpen: true,
           reset: false,
           stageChanged: false,
           updatedAt: Date.now()
         };
         io.emit('state_update', globalState);
     }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
