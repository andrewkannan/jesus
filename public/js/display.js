const socket = io();

const statusEl = document.getElementById('connection-status');
const textEl = document.getElementById('jesus-text');
const scorePeakEl = document.getElementById('score-peak');

const TIER_THRESHOLDS = [
    { db: 120, tier: 4 }, // Heavenly Rumble
    { db: 115, tier: 3 }, // Blinding White Glory
    { db: 110, tier: 2 }, // Golden Holy Fire
    { db: 105, tier: 1 }  // Electric Blue
];

let currentTier = 0;
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
    
    // Check for Achievement Glow Tiers
    if (state.db) {
        let newTier = 0;
        for (const t of TIER_THRESHOLDS) {
            if (state.db >= t.db) {
                newTier = t.tier;
                break;
            }
        }
        
        // Only upgrade the tier, don't downgrade it immediately if locked
        if (newTier > currentTier) {
            currentTier = newTier;
            if (achievementTimer) clearTimeout(achievementTimer);
            // Lock the achievement glow for 10 seconds
            achievementTimer = setTimeout(() => {
                currentTier = 0;
            }, 10000);
        }
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
    
    // Force maximum visual level if a tier is achieved
    let visualLevel = currentTier > 0 ? 100 : currentLevel;
    
    applyEffect(visualLevel, effectMode, currentTier);

    requestAnimationFrame(render);
}

function applyEffect(level, effect, tier) {
    let scale = 1;
    let textShadow = 'none';
    let opacity = 1;

    const nLevel = Math.max(0, Math.min(100, level)) / 100;

    if (tier === 1) {
        // TIER 1 (105 dB): ELECTRIC BLUE
        scale = 1.15;
        textEl.style.color = '#fff';
        const offsetX = (Math.random() - 0.5) * 2;
        const offsetY = (Math.random() - 0.5) * 2;
        textShadow = `
            0 0 20px #fff,
            0 0 40px #00ffff,
            0 0 80px #0000ff,
            0 0 120px rgba(0, 100, 255, 0.8)
        `;
        textEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }
    else if (tier === 2) {
        // TIER 2 (110 dB): GOLDEN HOLY FIRE
        scale = 1.25;
        textEl.style.color = '#fff';
        const offsetX = (Math.random() - 0.5) * 4;
        const offsetY = (Math.random() - 0.5) * 4;
        textShadow = `
            0 -10px 30px #fff, 
            0 -20px 50px #ffe600, 
            0 -40px 80px #ff8c00,
            0 0 100px rgba(255, 140, 0, 0.8)
        `;
        textEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }
    else if (tier === 3) {
        // TIER 3 (115 dB): BLINDING WHITE GLORY
        scale = 1.35;
        textEl.style.color = '#fff';
        const offsetX = (Math.random() - 0.5) * 6;
        const offsetY = (Math.random() - 0.5) * 6;
        textShadow = `
            0 0 40px #fff, 
            0 0 80px #fff, 
            0 0 120px #fff,
            0 0 150px rgba(255, 255, 255, 0.8)
        `;
        textEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }
    else if (tier === 4) {
        // TIER 4 (120+ dB): HEAVENLY RUMBLE (Cosmic/Rainbow Aura)
        scale = 1.45;
        textEl.style.color = '#fff';
        const offsetX = (Math.random() - 0.5) * 12;
        const offsetY = (Math.random() - 0.5) * 12;
        textShadow = `
            0 0 40px #fff, 
            0 -40px 100px #00ffff, 
            0 40px 100px #ff00ff,
            -40px 0 100px #ffe600,
            40px 0 100px #ff0000
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
