const socket = io();

const statusEl = document.getElementById('connection-status');
const textEl = document.getElementById('jesus-text');
const scorePeakEl = document.getElementById('score-peak');

const TARGET_DB = 115;
let isAchieved = false;
let achievementTimer = null;

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
    if (state.manualOverride) {
        targetLevel = state.level;
    } else {
        targetLevel = state.level;
    }
    
    if (scorePeakEl) {
        scorePeakEl.textContent = `${state.peak || 0} dB`;
    }
    
    // Check for Achievement Glow
    if (state.db >= TARGET_DB && !isAchieved) {
        isAchieved = true;
        if (achievementTimer) clearTimeout(achievementTimer);
        // Lock the achievement glow for 4 seconds
        achievementTimer = setTimeout(() => {
            isAchieved = false;
        }, 4000);
    }
    
    effectMode = state.effect;
    lastUpdate = Date.now();
});

// Render loop
function render() {
    if (Date.now() - lastUpdate > 2000) {
        targetLevel = 0;
    }

    currentLevel += (targetLevel - currentLevel) * 0.1;
    
    // Force maximum visual level if achieved
    let visualLevel = isAchieved ? 100 : currentLevel;
    
    applyEffect(visualLevel, effectMode, isAchieved);

    requestAnimationFrame(render);
}

function applyEffect(level, effect, achieved) {
    let scale = 1;
    let textShadow = 'none';
    let opacity = 1;

    const nLevel = Math.max(0, Math.min(100, level)) / 100;

    if (achieved) {
        // Golden Holy Fire Effect
        scale = 1.3;
        opacity = 1;
        textEl.style.color = '#fff';
        
        // Rumble effect
        const offsetX = (Math.random() - 0.5) * 6;
        const offsetY = (Math.random() - 0.5) * 6;
        
        textShadow = `
            0 -10px 30px #fff, 
            0 -20px 50px #ffe600, 
            0 -40px 80px #ff8c00,
            0 0 100px rgba(255, 140, 0, 0.8)
        `;
        textEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    } 
    else if (effect === 'minimal') {
        opacity = 0.5 + (nLevel * 0.5);
        scale = 1 + (nLevel * 0.05);
        textEl.style.color = '#fff';
        textEl.style.transform = `scale(${scale})`;
    } 
    else if (effect === 'energy') {
        scale = 1 + (nLevel * 0.2);
        
        const r = Math.floor(255);
        const g = Math.floor(255 - (nLevel * 100));
        const b = Math.floor(255 - (nLevel * 100));
        textEl.style.color = `rgb(${r}, ${g}, ${b})`;
        
        const glow = nLevel * 50;
        textShadow = `0 0 ${glow}px rgba(255, 100, 100, ${nLevel})`;
        
        if (nLevel > 0.8) {
            const offsetX = (Math.random() - 0.5) * (nLevel * 10);
            const offsetY = (Math.random() - 0.5) * (nLevel * 10);
            textEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        } else {
            textEl.style.transform = `translate(0px, 0px) scale(${scale})`;
        }
    } 
    else {
        // Cinematic
        scale = 1 + (nLevel * 0.15);
        opacity = 0.6 + (nLevel * 0.4);
        
        const baseGlow = 10 + (nLevel * 80);
        textShadow = `0 0 ${baseGlow}px rgba(255, 255, 255, ${nLevel * 0.8})`;
        textEl.style.color = '#fff';
        textEl.style.transform = `scale(${scale})`;
    }

    textEl.style.opacity = opacity;
    textEl.style.textShadow = textShadow;
}

requestAnimationFrame(render);
