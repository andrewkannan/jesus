const socket = io();

const statusEl = document.getElementById('connection-status');
const textEl = document.getElementById('jesus-text');
const scorePeakEl = document.getElementById('score-peak');
const audioOverlay = document.getElementById('audio-overlay');

const TIER_THRESHOLDS = [
    { db: 120, tier: 4 }, // Heavenly Rumble
    { db: 115, tier: 3 }, // Blinding White Glory
    { db: 110, tier: 2 }, // Golden Holy Fire
    { db: 105, tier: 1 }  // Electric Blue
];

let currentTier = 0;
let achievementTimer = null;
let displayAudioCtx = null;
let audioEnabled = false;

// Enable Audio on click
audioOverlay.addEventListener('click', () => {
    displayAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (displayAudioCtx.state === 'suspended') displayAudioCtx.resume();
    audioEnabled = true;
    audioOverlay.style.display = 'none';
});

// State
let targetLevel = 0;
let currentLevel = 0;
let lastUpdate = Date.now();
let isManualOverride = false;

// Connection handling
socket.on('connect', () => {
    statusEl.textContent = '● CONNECTED';
    statusEl.className = 'connected';
});

socket.on('disconnect', () => {
    statusEl.textContent = '● DISCONNECTED';
    statusEl.className = '';
    targetLevel = 0;
    isManualOverride = false;
});

// Receive state updates
socket.on('state_update', (state) => {
    // Handle explicit reset or override disable to 0
    if (state.reset) {
        if (achievementTimer) {
            clearTimeout(achievementTimer);
            achievementTimer = null;
        }
        currentTier = 0;
        targetLevel = 0;
        currentLevel = 0;
        isManualOverride = false;
        if (scorePeakEl) scorePeakEl.textContent = '0 dB';
        lastUpdate = Date.now();
        return;
    }

    const wasManualOverride = isManualOverride;
    isManualOverride = Boolean(state.manualOverride);
    targetLevel = typeof state.level === 'number' ? state.level : 0;
    
    if (scorePeakEl) {
        scorePeakEl.textContent = `${state.peak || 0} dB`;
    }
    
    // Check for Achievement Glow Tiers
    const db = typeof state.db === 'number' ? state.db : 0;
    let newTier = 0;
    for (const t of TIER_THRESHOLDS) {
        if (db >= t.db) {
            newTier = t.tier;
            break;
        }
    }

    if (isManualOverride) {
        // In manual override, allow moving up AND down across all tiers freely for testing
        if (newTier !== currentTier) {
            if (newTier > 0) {
                playAchievementSound(newTier);
            }
            currentTier = newTier;
        }
        if (achievementTimer) {
            clearTimeout(achievementTimer);
            achievementTimer = null;
        }
    } else if (wasManualOverride && !isManualOverride) {
        // Override was just turned off: clear any override-held tier
        if (achievementTimer) {
            clearTimeout(achievementTimer);
            achievementTimer = null;
        }
        currentTier = newTier;
    } else if (newTier > currentTier) {
        // Live crowd audio: upgrade tier and lock the achievement glow for 10 seconds
        playAchievementSound(newTier);
        currentTier = newTier;
        
        if (achievementTimer) clearTimeout(achievementTimer);
        achievementTimer = setTimeout(() => {
            currentTier = 0;
            achievementTimer = null;
        }, 10000);
    }
    
    lastUpdate = Date.now();
});

// Sound Synthesizer
function playAchievementSound(tier) {
    if (!audioEnabled || !displayAudioCtx) return;
    
    if (displayAudioCtx.state === 'suspended') displayAudioCtx.resume();

    const t = displayAudioCtx.currentTime;

    // 1. Massive Sub Boom (All Tiers)
    const subOsc = displayAudioCtx.createOscillator();
    const subGain = displayAudioCtx.createGain();
    
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(80 + (tier * 10), t);
    subOsc.frequency.exponentialRampToValueAtTime(20, t + 1.5); // Bass drop sweep
    
    subGain.gain.setValueAtTime(0, t);
    subGain.gain.linearRampToValueAtTime(1.0 + (tier * 0.2), t + 0.05); // Hit hard
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 2 + (tier * 0.5)); // Fade out
    
    subOsc.connect(subGain);
    subGain.connect(displayAudioCtx.destination);
    
    subOsc.start(t);
    subOsc.stop(t + 4);

    // 2. Cinematic Rumble/Crunch (Tier 2 and up)
    if (tier >= 2) {
        const saw = displayAudioCtx.createOscillator();
        const sawGain = displayAudioCtx.createGain();
        const filter = displayAudioCtx.createBiquadFilter();
        
        saw.type = 'sawtooth';
        saw.frequency.setValueAtTime(40 + (tier * 10), t);
        saw.frequency.exponentialRampToValueAtTime(10, t + 2);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300 + (tier * 100), t);
        filter.frequency.exponentialRampToValueAtTime(40, t + 1.5);
        
        sawGain.gain.setValueAtTime(0, t);
        sawGain.gain.linearRampToValueAtTime(0.5, t + 0.05);
        sawGain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        
        saw.connect(filter);
        filter.connect(sawGain);
        sawGain.connect(displayAudioCtx.destination);
        
        saw.start(t);
        saw.stop(t + 2);
    }
    
    // 3. Heavenly Chord (Tier 3 and 4)
    if (tier >= 3) {
        // C Major chord frequencies
        const chord = [261.63, 329.63, 392.00, 523.25]; 
        
        chord.forEach(freq => {
            const chordOsc = displayAudioCtx.createOscillator();
            const chordGain = displayAudioCtx.createGain();
            
            chordOsc.type = 'triangle'; 
            // Tier 4 plays it an octave higher for extreme intensity
            chordOsc.frequency.value = freq * (tier === 4 ? 2 : 1);
            
            chordGain.gain.setValueAtTime(0, t);
            chordGain.gain.linearRampToValueAtTime(0.15, t + 0.1);
            chordGain.gain.exponentialRampToValueAtTime(0.001, t + 3 + (tier * 0.5));
            
            chordOsc.connect(chordGain);
            chordGain.connect(displayAudioCtx.destination);
            
            chordOsc.start(t);
            chordOsc.stop(t + 5);
        });
    }
}

// Render loop
function render() {
    // Only decay to 0 on idle timeout if manual override is NOT active
    if (!isManualOverride && Date.now() - lastUpdate > 2000) {
        targetLevel = 0;
    }

    // Snappier lerp (0.4 instead of 0.1) for much faster word response
    currentLevel += (targetLevel - currentLevel) * 0.4;
    
    // Force maximum visual level if a tier is achieved
    const visualLevel = currentTier > 0 ? 100 : currentLevel;
    
    applyEffect(visualLevel, currentTier);

    requestAnimationFrame(render);
}

function applyEffect(level, tier) {
    let scale = 1;
    let opacity = 1;

    const nLevel = Math.max(0, Math.min(100, level)) / 100;

    // Reset styles that might have been applied directly
    textEl.className = '';
    textEl.style.textShadow = '';
    
    if (tier === 1) {
        textEl.classList.add('tier-1');
        scale = 1.15;
        const offsetX = (Math.random() - 0.5) * 2;
        const offsetY = (Math.random() - 0.5) * 2;
        textEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }
    else if (tier === 2) {
        textEl.classList.add('tier-2');
        scale = 1.25;
        const offsetX = (Math.random() - 0.5) * 4;
        const offsetY = (Math.random() - 0.5) * 4;
        textEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }
    else if (tier === 3) {
        textEl.classList.add('tier-3');
        scale = 1.35;
        const offsetX = (Math.random() - 0.5) * 6;
        const offsetY = (Math.random() - 0.5) * 6;
        textEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }
    else if (tier === 4) {
        textEl.classList.add('tier-4');
        scale = 1.45;
        const offsetX = (Math.random() - 0.5) * 12;
        const offsetY = (Math.random() - 0.5) * 12;
        textEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    } 
    else {
        // Cinematic build-up towards Tier 1 (105 dB)
        scale = 1 + (nLevel * 0.15); // Scales up to 1.15
        opacity = 0.6 + (nLevel * 0.4);
        
        // Tremble effect as they get closer to Tier 1
        let offsetX = 0;
        let offsetY = 0;
        if (nLevel > 0.5) { 
            const rumble = (nLevel - 0.5) * 4;
            offsetX = (Math.random() - 0.5) * rumble;
            offsetY = (Math.random() - 0.5) * rumble;
        }

        const baseGlow = 10 + (nLevel * 80);
        // Gradually mix in some cyan/blue to build anticipation for Tier 1
        const r = Math.floor(255 - (nLevel * 100));
        const g = Math.floor(255 - (nLevel * 20));
        const b = 255;

        textEl.style.textShadow = `0 0 ${baseGlow}px rgba(${r}, ${g}, ${b}, ${nLevel * 0.9})`;
        textEl.style.color = '#fff';
        textEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    textEl.style.opacity = opacity;
}

requestAnimationFrame(render);
