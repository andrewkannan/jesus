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
  peak: 0,
  average: 0,
  status: 'idle',
  effect: 'cinematic',
  manualOverride: false,
  updatedAt: Date.now()
};

const REMOTE_PIN = process.env.REMOTE_PIN || '1234';

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication endpoint for the remote
app.post('/api/auth', (req, res) => {
  const { pin } = req.body;
  if (pin === REMOTE_PIN) {
    res.json({ success: true });
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
    // Basic verification: remote should send the pin with updates
    if (data.pin !== REMOTE_PIN) {
        return;
    }

    // Update global state
    globalState = {
      ...globalState,
      level: typeof data.level === 'number' ? data.level : globalState.level,
      peak: typeof data.peak === 'number' ? data.peak : globalState.peak,
      average: typeof data.average === 'number' ? data.average : globalState.average,
      status: data.status || globalState.status,
      effect: data.effect || globalState.effect,
      manualOverride: typeof data.manualOverride === 'boolean' ? data.manualOverride : globalState.manualOverride,
      updatedAt: Date.now()
    };
    
    // Broadcast to display clients
    io.emit('state_update', globalState);
  });
  
  socket.on('command', (data) => {
     if (data.pin !== REMOTE_PIN) return;
     
     if (data.command === 'reset') {
         globalState.level = 0;
         globalState.peak = 0;
         globalState.average = 0;
         globalState.status = 'idle';
         globalState.updatedAt = Date.now();
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
