const socket = io();

const statusEl = document.getElementById('connection-status');
const textEl = document.getElementById('jesus-text');

// State
let targetLevel = 0;
let currentLevel = 0;
let lastUpdate = Date.now();
let effectMode = 'cinematic'; // 'minimal', 'energy', 'cinematic'

// Connection handling
socket.on('connect', () => {
    statusEl.textContent = '● CONNECTED';
    statusEl.className = 'connected';
});

socket.on('disconnect', () => {
    statusEl.textContent = '● DISCONNECTED';
    statusEl.className = '';
    targetLevel = 0;
});

// Receive state updates
socket.on('state_update', (state) => {
    // If the manual override is active, use it instead of the live audio level
    if (state.manualOverride) {
        targetLevel = state.level; // Could be a manual set level
    } else {
        targetLevel = state.level;
    }
    
    effectMode = state.effect;
    lastUpdate = Date.now();
});

// Render loop
function render() {
    // Drop level if disconnected or no updates for 2 seconds
    if (Date.now() - lastUpdate > 2000) {
        targetLevel = 0;
    }

    // Interpolation (lerp) for smooth animation
    // currentLevel moves 10% closer to targetLevel each frame
    currentLevel += (targetLevel - currentLevel) * 0.1;

    // Map currentLevel (0-100) to visual properties based on effect mode
    applyEffect(currentLevel, effectMode);

    requestAnimationFrame(render);
}

function applyEffect(level, effect) {
    // Base properties
    let scale = 1;
    let textShadow = 'none';
    let opacity = 1;

    // Normalize level 0-1
    const nLevel = Math.max(0, Math.min(100, level)) / 100;

    if (effect === 'minimal') {
        // Minimal: just opacity and slight scaling
        opacity = 0.5 + (nLevel * 0.5);
        scale = 1 + (nLevel * 0.05);
    } 
    else if (effect === 'energy') {
        // Energy: active scaling, bright colors, shaking at high levels
        scale = 1 + (nLevel * 0.2);
        
        // RGB shift based on energy
        const r = Math.floor(255);
        const g = Math.floor(255 - (nLevel * 100));
        const b = Math.floor(255 - (nLevel * 100));
        
        textEl.style.color = `rgb(${r}, ${g}, ${b})`;
        
        const glow = nLevel * 50;
        textShadow = `0 0 ${glow}px rgba(255, 100, 100, ${nLevel})`;
        
        // Shake at very high levels
        if (nLevel > 0.8) {
            const offsetX = (Math.random() - 0.5) * (nLevel * 10);
            const offsetY = (Math.random() - 0.5) * (nLevel * 10);
            textEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        } else {
            textEl.style.transform = `translate(0px, 0px) scale(${scale})`;
        }
        
    } 
    else {
        // Cinematic (Default): Smooth subtle breath, elegant glow
        scale = 1 + (nLevel * 0.15);
        opacity = 0.6 + (nLevel * 0.4);
        
        const baseGlow = 10 + (nLevel * 80);
        textShadow = `0 0 ${baseGlow}px rgba(255, 255, 255, ${nLevel * 0.8})`;
        textEl.style.color = '#fff';
        textEl.style.transform = `scale(${scale})`;
    }

    if (effect !== 'energy') {
         textEl.style.transform = `scale(${scale})`;
    }
    
    textEl.style.opacity = opacity;
    textEl.style.textShadow = textShadow;
}

// Start loop
requestAnimationFrame(render);
