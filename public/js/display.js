const socket = io();

const debugInfoEl = document.getElementById('debug-info');
const statusEl = document.getElementById('connection-status');
const textEl = document.getElementById('jesus-text');
const eyebrowEl = document.getElementById('stage-eyebrow');
const tierBadgeEl = document.getElementById('tier-badge');
const scorePeakEl = document.getElementById('score-peak');
const scoreLiveEl = document.getElementById('score-live');
const stageMeterFill = document.getElementById('stage-meter-fill');
const unlockContainer = document.getElementById('unlock-container');
const unlockLabel = document.getElementById('unlock-label');
const unlockFill = document.getElementById('unlock-fill');
const stageCurtainEl = document.getElementById('stage-curtain');
const meterTags = [
    document.getElementById('m-tier-1'),
    document.getElementById('m-tier-2'),
    document.getElementById('m-tier-3'),
    document.getElementById('m-tier-4')
];

const UNLOCK_DURATION_MS = 5000; // 5 seconds lock & unlock

// 4 Words + Grand Finale Configuration (Clean worship text, no "Group X Complete")
const STAGES = [
    {
        stage: 0,
        eyebrow: 'LIFT YOUR VOICE IN PRAISE',
        word: 'JESUS',
        unlockMsg: 'CROWN OF GLORY — UNLOCKING NEXT WORD'
    },
    {
        stage: 1,
        eyebrow: 'DECLARE YOUR FREEDOM',
        word: 'I AM FREE',
        unlockMsg: 'CROWN OF GLORY — UNLOCKING NEXT WORD'
    },
    {
        stage: 2,
        eyebrow: 'PROCLAIM THE LIVING HOPE',
        word: 'HE IS RISEN',
        unlockMsg: 'CROWN OF GLORY — UNLOCKING NEXT WORD'
    },
    {
        stage: 3,
        eyebrow: 'WALK IN HIS POWER',
        word: 'VICTORY',
        unlockMsg: 'CROWN OF GLORY — UNLOCKING FINAL WORD'
    },
    {
        stage: 4,
        eyebrow: '★ WALK IN HIS PROMISE ★',
        word: 'NOTHING IS IMPOSSIBLE\nWITH GOD',
        unlockMsg: '★ GOD IS FAITHFUL ★'
    }
];

const TIER_THRESHOLDS = [
    { db: 120, tier: 4, label: 'TIER 4 · CROWN OF GLORY', color: '#B45309' },
    { db: 115, tier: 3, label: 'TIER 3 · ROYAL AMBER', color: '#996515' },
    { db: 110, tier: 2, label: 'TIER 2 · RADIANT GOLD', color: '#B8860B' },
    { db: 105, tier: 1, label: 'TIER 1 · MORNING DAWN', color: '#785A28' }
];

let currentStage = 0;
let currentTier = 0;
let isFinalVictory = false;
let isCurtainOpen = false;
let curtainOpenProgress = 0; // 0 = closed, 1 = fully open
let curtainAnimFrom = 0;
let curtainAnimStart = 0;
const CURTAIN_DURATION_MS = 2400; // Smooth 2.4s stage curtain glide
let curtainCleared = false;
let curtainSpillTimer = null;
let achievementTimer = null;
let tier4StartTime = 0;
let displayAudioCtx = null;

// State
let targetLevel = 0;
let currentLevel = 0;
let currentDb = 0;
let lastUpdate = Date.now();
let isManualOverride = false;

// --- INTERACTIVE CANVAS FX (Sunbeams, Shockwaves, Golden Particles, Victory Confetti) ---
const canvas = document.getElementById('fx-canvas');
const ctx = canvas.getContext('2d');
const curtainCanvas = document.getElementById('curtain-canvas');
const curtainCtx = curtainCanvas ? curtainCanvas.getContext('2d') : null;
let cw = window.innerWidth;
let ch = window.innerHeight;
let shockwaves = [];
let particles = [];
let confetti = [];
let sunbeamAngle = 0;
let lastAmbientWave = 0;

function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (curtainCanvas && curtainCtx) {
        curtainCanvas.width = cw * dpr;
        curtainCanvas.height = ch * dpr;
        curtainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        curtainCleared = false;
    }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Initialize floating golden dust motes
for (let i = 0; i < 65; i++) {
    particles.push({
        x: Math.random() * cw,
        y: Math.random() * ch,
        r: 1.2 + Math.random() * 2.8,
        vy: -(0.3 + Math.random() * 0.9),
        vx: (Math.random() - 0.5) * 0.4,
        alpha: 0.15 + Math.random() * 0.45,
        hue: Math.random() > 0.3 ? '212, 175, 55' : '180, 83, 9'
    });
}

function spawnShockwave(intensity = 1, count = 1) {
    // Cap active shockwaves to 6 to keep canvas 60fps smooth
    if (shockwaves.length > 6) {
        shockwaves.splice(0, shockwaves.length - 4);
    }
    for (let i = 0; i < count; i++) {
        shockwaves.push({
            r: 40 + i * 32,
            maxR: Math.max(cw, ch) * (0.55 + intensity * 0.2),
            alpha: 0.4 + intensity * 0.1,
            speed: 6 + intensity * 3.5 + i * 1.2,
            lineWidth: 1.5 + intensity
        });
    }
}

function spawnVictoryConfettiBurst() {
    confetti = [];
    const colors = ['#D4AF37', '#F59E0B', '#B45309', '#FDE68A', '#996515'];
    for (let i = 0; i < 65; i++) {
        confetti.push({
            x: Math.random() * cw,
            y: -20 - Math.random() * ch * 0.7,
            w: 6 + Math.random() * 6,
            h: 10 + Math.random() * 10,
            vy: 2.0 + Math.random() * 2.8,
            vx: (Math.random() - 0.5) * 1.8,
            phase: Math.random() * Math.PI * 2,
            color: colors[i % colors.length],
            alpha: 0.8
        });
    }
}

let lastAppliedClass = '';

function setWordEffectClass(cls) {
    if (lastAppliedClass === cls) return;
    textEl.classList.remove('tier-1', 'tier-2', 'tier-3', 'tier-4', 'final-victory-glory');
    if (cls) {
        textEl.classList.add(cls);
    }
    lastAppliedClass = cls;
}

function ensureAudioContext() {
    try {
        if (!displayAudioCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) displayAudioCtx = new AudioCtx();
        }
        if (displayAudioCtx && displayAudioCtx.state === 'suspended') {
            displayAudioCtx.resume().catch(() => {});
        }
        return Boolean(displayAudioCtx && displayAudioCtx.state === 'running');
    } catch (e) {
        return false;
    }
}

// Passively unlock audio if the display window ever receives any gesture during setup
['click', 'keydown', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, () => ensureAudioContext(), { once: true, passive: true });
});

function setCurtainState(open, animate = true) {
    if (!stageCurtainEl) return;
    const nextOpen = Boolean(open);
    if (nextOpen === isCurtainOpen) return;
    isCurtainOpen = nextOpen;
    curtainAnimFrom = curtainOpenProgress;
    curtainAnimStart = Date.now();
    curtainCleared = false;

    if (curtainSpillTimer) {
        clearTimeout(curtainSpillTimer);
        curtainSpillTimer = null;
    }

    if (isCurtainOpen) {
        stageCurtainEl.classList.remove('curtain-closed');
        stageCurtainEl.classList.add('curtain-open', 'curtain-opening');
        stageCurtainEl.setAttribute('aria-hidden', 'true');
        curtainSpillTimer = setTimeout(() => {
            stageCurtainEl.classList.remove('curtain-opening');
        }, 2200);

        if (animate) {
            spawnShockwave(1.3, 3);
            applyStageUI(currentStage, true);
            playCurtainOpenSound();
        }
    } else {
        stageCurtainEl.classList.remove('curtain-open', 'curtain-opening');
        stageCurtainEl.classList.add('curtain-closed');
        stageCurtainEl.setAttribute('aria-hidden', 'false');
    }
}

function activateFinalVictory() {
    if (isFinalVictory) return;
    isFinalVictory = true;
    currentTier = 4;
    clearTierLock();
    document.body.classList.add('final-victory-mode');
    tierBadgeEl.classList.add('victory-badge');
    eyebrowEl.textContent = '★ ALL PRAISE & GLORY // VICTORY IN JESUS ★';
    setWordEffectClass('final-victory-glory');
    spawnShockwave(1.6, 3);
    spawnVictoryConfettiBurst();
    playFinalVictorySymphony();
    updateTierBadge(4, Math.max(currentDb, 125));
}

// Connection handling
socket.on('connect', () => {
    statusEl.textContent = 'CONNECTED';
    debugInfoEl.classList.add('connected');
});

socket.on('disconnect', () => {
    statusEl.textContent = 'DISCONNECTED';
    debugInfoEl.classList.remove('connected');
    targetLevel = 0;
    isManualOverride = false;
});

let transitionTimeout = null;

function applyStageUI(stageIdx, animate = true) {
    const safeIdx = Math.max(0, Math.min(STAGES.length - 1, stageIdx));
    currentStage = safeIdx;
    const s = STAGES[safeIdx];

    if (!isFinalVictory) {
        document.body.classList.remove('final-victory-mode');
        tierBadgeEl.classList.remove('victory-badge');
        confetti = [];
        setWordEffectClass('');
    }

    eyebrowEl.textContent = isFinalVictory
        ? '★ ALL PRAISE & GLORY // VICTORY IN JESUS ★'
        : s.eyebrow;
    textEl.setAttribute('data-stage', String(safeIdx));
    textEl.innerHTML = s.word.replace('\n', '<br>');

    if (animate) {
        textEl.classList.remove('word-transition');
        if (transitionTimeout) clearTimeout(transitionTimeout);
        requestAnimationFrame(() => {
            textEl.classList.add('word-transition');
            transitionTimeout = setTimeout(() => {
                textEl.classList.remove('word-transition');
            }, 460);
        });
        if (!isFinalVictory) {
            spawnShockwave(1.2, 2);
        }
    }

    updateTierBadge(currentTier, currentDb);
}

function updateTierBadge(tier, db) {
    meterTags.forEach((tag, idx) => {
        if (tag) tag.classList.toggle('active', isFinalVictory || tier >= idx + 1);
    });

    if (isFinalVictory) {
        tierBadgeEl.textContent = '★ GOD IS FAITHFUL ★';
        tierBadgeEl.classList.add('victory-badge');
        return;
    }

    tierBadgeEl.classList.remove('victory-badge');

    if (tier > 0) {
        const t = TIER_THRESHOLDS.find(x => x.tier === tier);
        tierBadgeEl.textContent = t ? t.label : '★ GOD IS FAITHFUL ★';
        tierBadgeEl.style.color = t ? t.color : '#996515';
        tierBadgeEl.style.borderColor = 'rgba(180, 83, 9, 0.45)';
    } else if (db >= 70) {
        tierBadgeEl.textContent = '★ GOD IS FAITHFUL · KEEP LIFTING YOUR VOICE ★';
        tierBadgeEl.style.color = '#575047';
        tierBadgeEl.style.borderColor = 'rgba(153, 101, 21, 0.22)';
    } else {
        tierBadgeEl.textContent = '★ GOD IS FAITHFUL ★';
        tierBadgeEl.style.color = '#8C8275';
        tierBadgeEl.style.borderColor = 'rgba(153, 101, 21, 0.16)';
    }
}

function triggerTier4LockAndUnlock() {
    tier4StartTime = Date.now();
    if (currentStage < 4) {
        unlockLabel.textContent = STAGES[currentStage].unlockMsg;
        unlockFill.style.width = '0%';
        unlockContainer.classList.remove('hidden');
    }
}

function clearTierLock() {
    if (achievementTimer) {
        clearTimeout(achievementTimer);
        achievementTimer = null;
    }
    tier4StartTime = 0;
    unlockContainer.classList.add('hidden');
    unlockFill.style.width = '0%';
}

// Receive state updates
socket.on('state_update', (state) => {
    if (state.reset) {
        clearTierLock();
        isFinalVictory = false;
        currentTier = 0;
        targetLevel = 0;
        currentLevel = 0;
        currentDb = 0;
        isManualOverride = false;
        document.body.classList.remove('final-victory-mode');
        tierBadgeEl.classList.remove('victory-badge');
        confetti = [];
        setWordEffectClass('');
        if (scorePeakEl) scorePeakEl.textContent = '0 dB';
        if (scoreLiveEl) scoreLiveEl.textContent = '0 dB';
        if (stageMeterFill) stageMeterFill.style.width = '0%';
        applyStageUI(0, false);
        setCurtainState(Boolean(state.curtainOpen), true);
        lastUpdate = Date.now();
        return;
    }

    // Sync Stage Curtain Open/Close state from Remote
    if (typeof state.curtainOpen === 'boolean' && state.curtainOpen !== isCurtainOpen) {
        setCurtainState(state.curtainOpen, true);
    }

    // Check if Final Win was triggered directly from Remote button
    if (state.finalWin && !isFinalVictory) {
        setCurtainState(true, false);
        if (currentStage !== 4) {
            currentStage = 4;
            textEl.setAttribute('data-stage', '4');
            textEl.innerHTML = STAGES[4].word.replace('\n', '<br>');
        }
        activateFinalVictory();
        lastUpdate = Date.now();
        return;
    }

    // Check if stage changed (via Remote group buttons or auto-unlock)
    if (typeof state.stage === 'number' && state.stage !== currentStage) {
        clearTierLock();
        currentTier = 0;
        isFinalVictory = false;
        applyStageUI(state.stage, true);
        playStageTransitionChime();
    } else if (state.stageChanged && !state.finalWin) {
        clearTierLock();
        currentTier = 0;
        isFinalVictory = false;
        applyStageUI(currentStage, true);
    }

    const wasManualOverride = isManualOverride;
    isManualOverride = Boolean(state.manualOverride);
    targetLevel = typeof state.level === 'number' ? state.level : 0;
    currentDb = typeof state.db === 'number' ? state.db : 0;
    
    if (scorePeakEl) scorePeakEl.textContent = `${state.peak || 0} dB`;
    if (scoreLiveEl) scoreLiveEl.textContent = `${currentDb} dB`;

    const barPercent = isFinalVictory
        ? 100
        : Math.max(0, Math.min(100, ((currentDb - 40) / 90) * 100));
    if (stageMeterFill) stageMeterFill.style.width = `${barPercent}%`;
    
    if (isFinalVictory) {
        lastUpdate = Date.now();
        return;
    }

    // Determine Tier
    let newTier = 0;
    for (const t of TIER_THRESHOLDS) {
        if (currentDb >= t.db) {
            newTier = t.tier;
            break;
        }
    }

    // If we are on Stage 4 ("NOTHING IS IMPOSSIBLE WITH GOD") and the whole crowd hits Tier 4 (120 dB), unleash Final Victory!
    if (currentStage === 4 && newTier === 4) {
        activateFinalVictory();
        lastUpdate = Date.now();
        return;
    }

    if (isManualOverride) {
        if (newTier !== currentTier) {
            if (newTier > 0) {
                playAchievementSound(newTier);
                spawnShockwave(newTier * 0.4, 2);
            }
            currentTier = newTier;
            if (currentTier === 4 && currentStage < 4) {
                triggerTier4LockAndUnlock();
            } else {
                clearTierLock();
            }
        }
    } else if (wasManualOverride && !isManualOverride) {
        clearTierLock();
        currentTier = newTier;
    } else if (newTier > currentTier) {
        playAchievementSound(newTier);
        spawnShockwave(newTier * 0.4, 2);
        currentTier = newTier;

        if (achievementTimer) clearTimeout(achievementTimer);
        if (currentTier === 4 && currentStage < 4) {
            triggerTier4LockAndUnlock();
        }
        achievementTimer = setTimeout(() => {
            currentTier = 0;
            clearTierLock();
            updateTierBadge(0, currentDb);
        }, UNLOCK_DURATION_MS);
    }

    updateTierBadge(currentTier, currentDb);
    lastUpdate = Date.now();
});

// --- WARM ARCHITECTURAL WORSHIP SOUND SYNTHESIZER ---
function playCurtainOpenSound() {
    if (!ensureAudioContext()) return;
    const t = displayAudioCtx.currentTime;
    const notes = [261.63, 329.63, 392.00, 493.88, 587.33, 783.99];
    notes.forEach((freq, idx) => {
        const osc = displayAudioCtx.createOscillator();
        const gain = displayAudioCtx.createGain();
        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        const startAt = t + idx * 0.09;
        osc.frequency.setValueAtTime(freq, startAt);
        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(0.11, startAt + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + 2.8);
        osc.connect(gain);
        gain.connect(displayAudioCtx.destination);
        osc.start(startAt);
        osc.stop(startAt + 3.0);
    });
}

function playAchievementSound(tier) {
    if (!ensureAudioContext()) return;

    const t = displayAudioCtx.currentTime;

    // 1. Warm Sanctuary Sub Foundation
    const subOsc = displayAudioCtx.createOscillator();
    const subGain = displayAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(65.41, t); // C2 warm sub
    subOsc.frequency.exponentialRampToValueAtTime(32.70, t + 1.4);

    subGain.gain.setValueAtTime(0, t);
    subGain.gain.linearRampToValueAtTime(0.45 + tier * 0.08, t + 0.06);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 2.2);

    subOsc.connect(subGain);
    subGain.connect(displayAudioCtx.destination);
    subOsc.start(t);
    subOsc.stop(t + 2.4);

    // 2. Uplifting Worship Pad & Shimmer Chimes (Major 9th / Add9 voicings)
    const voicings = {
        1: [261.63, 329.63, 392.00],                 // C Major
        2: [261.63, 329.63, 392.00, 587.33],         // C Add9
        3: [261.63, 329.63, 392.00, 493.88, 587.33], // C Maj9
        4: [261.63, 392.00, 523.25, 659.25, 783.99, 1046.50] // Grand Octave Triumph
    };

    const notes = voicings[tier] || voicings[1];
    notes.forEach((freq, idx) => {
        const osc = displayAudioCtx.createOscillator();
        const gain = displayAudioCtx.createGain();
        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.04);

        gain.gain.setValueAtTime(0, t + idx * 0.04);
        gain.gain.linearRampToValueAtTime(0.11, t + idx * 0.04 + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 2.8 + tier * 0.4);

        osc.connect(gain);
        gain.connect(displayAudioCtx.destination);
        osc.start(t + idx * 0.04);
        osc.stop(t + 3.2 + tier * 0.4);
    });
}

function playStageTransitionChime() {
    if (!ensureAudioContext()) return;
    const t = displayAudioCtx.currentTime;
    const notes = [392.00, 493.88, 587.33, 783.99];
    notes.forEach((freq, idx) => {
        const osc = displayAudioCtx.createOscillator();
        const gain = displayAudioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.08);
        gain.gain.setValueAtTime(0, t + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.12, t + idx * 0.08 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
        osc.connect(gain);
        gain.connect(displayAudioCtx.destination);
        osc.start(t + idx * 0.08);
        osc.stop(t + 2.2);
    });
}

function playFinalVictorySymphony() {
    if (!ensureAudioContext()) return;
    const t = displayAudioCtx.currentTime;

    // Deep Sanctuary Sub Drop
    const subOsc = displayAudioCtx.createOscillator();
    const subGain = displayAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(87.31, t);
    subOsc.frequency.exponentialRampToValueAtTime(32.70, t + 2.5);
    subGain.gain.setValueAtTime(0, t);
    subGain.gain.linearRampToValueAtTime(0.65, t + 0.08);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 4.2);
    subOsc.connect(subGain);
    subGain.connect(displayAudioCtx.destination);
    subOsc.start(t);
    subOsc.stop(t + 4.4);

    // Majestic Ascending Cathedral Fanfare (6 rich harmonics)
    const chord = [261.63, 329.63, 392.00, 523.25, 659.25, 1046.50];
    chord.forEach((freq, idx) => {
        const osc = displayAudioCtx.createOscillator();
        const gain = displayAudioCtx.createGain();
        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        const startAt = t + idx * 0.08;
        osc.frequency.setValueAtTime(freq, startAt);
        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(0.14, startAt + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + 5.5);
        osc.connect(gain);
        gain.connect(displayAudioCtx.destination);
        osc.start(startAt);
        osc.stop(startAt + 5.8);
    });
}

// --- 60FPS RENDER LOOP ---
function render() {
    const now = Date.now();
    if (!isManualOverride && !isFinalVictory && now - lastUpdate > 2000) {
        targetLevel = 0;
    }

    currentLevel += (targetLevel - currentLevel) * 0.35;
    const visualLevel = (currentTier > 0 || isFinalVictory) ? 100 : currentLevel;
    const nLevel = Math.max(0, Math.min(100, visualLevel)) / 100;

    // Update 5-second Tier 4 unlock progress bar if active
    if (tier4StartTime > 0 && currentTier === 4 && currentStage < 4) {
        const elapsed = now - tier4StartTime;
        const pct = Math.min(100, (elapsed / UNLOCK_DURATION_MS) * 100);
        unlockFill.style.width = `${pct}%`;
    }

    renderLiveCurtain(now, nLevel);
    renderCanvasFX(nLevel, currentTier, isFinalVictory, now);
    applyTypographyEffect(nLevel, currentTier, isFinalVictory, now);

    requestAnimationFrame(render);
}

// --- LIVE 60FPS CLOTH PHYSICS & SPOTLIGHT STAGE CURTAIN ---
function renderLiveCurtain(now, nLevel) {
    if (!curtainCtx) return;

    const target = isCurtainOpen ? 1 : 0;
    if (curtainOpenProgress !== target) {
        const elapsed = Math.max(0, now - curtainAnimStart);
        const u = Math.min(1, elapsed / CURTAIN_DURATION_MS);
        // Smooth cubic ease-in-out (matches the silky CSS cubic-bezier pace)
        const ease = u < 0.5
            ? 4 * u * u * u
            : 1 - Math.pow(-2 * u + 2, 3) / 2;
        curtainOpenProgress = curtainAnimFrom + (target - curtainAnimFrom) * ease;
        if (u >= 1) {
            curtainOpenProgress = target;
        }
    }

    // Zero CPU/GPU cost once curtain is completely open
    if (curtainOpenProgress >= 0.999 && isCurtainOpen) {
        if (!curtainCleared) {
            curtainCtx.clearRect(0, 0, cw, ch);
            curtainCleared = true;
        }
        return;
    }
    curtainCleared = false;
    curtainCtx.clearRect(0, 0, cw, ch);

    const t = now * 0.001;
    const pleats = 10;
    // Slight overlap at center seam when closed so no gap appears during gentle breeze sway
    const closedWidth = cw * 0.506;
    const openProgress = Math.max(0, Math.min(1, curtainOpenProgress));

    // Sweeping warm stage spotlights across the closed/opening curtain
    const spot1X = cw * (0.5 + Math.sin(t * 0.55) * 0.36);
    const spot2X = cw * (0.5 + Math.cos(t * 0.38) * 0.42);

    // Draw both Left (-1) and Right (+1) drapery wings
    for (let side = -1; side <= 1; side += 2) {
        const isLeft = side === -1;
        const anchorX = isLeft ? -16 : cw + 16;

        // Smooth stage curtain sweep with a subtle, natural silk drape curve
        const topSpan = closedWidth * (1 - openProgress * 1.04);
        const drapeCurve = Math.sin(openProgress * Math.PI) * (cw * 0.022);
        const midSpan = Math.max(0, topSpan - drapeCurve * 0.6);
        const botSpan = Math.max(0, topSpan - drapeCurve);

        if (topSpan <= 2 && midSpan <= 2 && botSpan <= 2) continue;

        // Precompute fold X coordinates at Top (y=0), Mid (y=ch*0.52), and Bottom (y=ch)
        const topX = [];
        const midX = [];
        const botX = [];

        const waveAmp = (1 - openProgress * 0.5) * (6.0 + nLevel * 9);

        for (let i = 0; i <= pleats; i++) {
            const frac = i / pleats;
            // Subtle accordion bunching toward the outer wings as curtain opens
            const bunchedFrac = Math.pow(frac, 1 + openProgress * 0.18);

            // Live organic cloth breeze harmonics (anchored at top, fuller sway at mid & bottom)
            const phase = t * 1.75 + i * 0.72 + (isLeft ? 0 : 1.7);
            const sway2 = Math.cos(t * 1.1 - i * 0.48) * (waveAmp * 0.42);
            const swayMid = (Math.sin(phase) * waveAmp + sway2) * (0.35 + frac * 0.65);
            const swayBot = (Math.sin(phase - 0.8) * (waveAmp * 1.55) + sway2 * 1.25) * (0.35 + frac * 0.65);

            topX[i] = anchorX - side * (topSpan * bunchedFrac);
            midX[i] = anchorX - side * (midSpan * bunchedFrac) + swayMid;
            botX[i] = anchorX - side * (botSpan * bunchedFrac) + swayBot;
        }

        // Soft stage floor shadow cast by the inner leading edge of each curtain wing
        const leadIdx = pleats;
        curtainCtx.save();
        curtainCtx.beginPath();
        curtainCtx.moveTo(topX[leadIdx], 0);
        curtainCtx.quadraticCurveTo(midX[leadIdx], ch * 0.52, botX[leadIdx], ch);
        curtainCtx.lineWidth = 26;
        curtainCtx.strokeStyle = 'rgba(28, 25, 23, 0.14)';
        curtainCtx.stroke();
        curtainCtx.restore();

        // Render each individual 3D silk pleat strip
        for (let i = 0; i < pleats; i++) {
            const x0Top = topX[i], x1Top = topX[i + 1];
            const x0Mid = midX[i], x1Mid = midX[i + 1];
            const x0Bot = botX[i], x1Bot = botX[i + 1];

            curtainCtx.beginPath();
            curtainCtx.moveTo(x0Top, 0);
            curtainCtx.quadraticCurveTo(x0Mid, ch * 0.52, x0Bot, ch);
            curtainCtx.lineTo(x1Bot, ch);
            curtainCtx.quadraticCurveTo(x1Mid, ch * 0.52, x1Top, 0);
            curtainCtx.closePath();

            // Calculate dynamic spotlight illumination on this pleat
            const pleatCenterX = (x0Mid + x1Mid) * 0.5;
            const d1 = Math.abs(pleatCenterX - spot1X) / (cw * 0.28);
            const d2 = Math.abs(pleatCenterX - spot2X) / (cw * 0.32);
            const lightBoost = Math.max(0, 1 - d1 * d1) * 0.55 + Math.max(0, 1 - d2 * d2) * 0.4;

            // Live 3D cylindrical silk shading across the pleat width
            const grad = curtainCtx.createLinearGradient(x0Mid, 0, x1Mid, 0);
            // Shift ridge highlight slightly with cloth wave so the silk shimmers alive!
            const ridgePos = Math.max(0.28, Math.min(0.72, 0.5 + Math.sin(t * 1.9 + i * 0.8) * 0.14));

            const peakR = Math.min(255, Math.round(250 + lightBoost * 5));
            const peakG = Math.min(253, Math.round(244 + lightBoost * 9));
            const peakB = Math.min(245, Math.round(226 + lightBoost * 18));

            grad.addColorStop(0, '#C8B084');
            grad.addColorStop(ridgePos * 0.5, '#E5D5B5');
            grad.addColorStop(ridgePos, `rgb(${peakR}, ${peakG}, ${peakB})`);
            grad.addColorStop(ridgePos + (1 - ridgePos) * 0.55, '#DFC9A0');
            grad.addColorStop(1, '#B89B67');

            curtainCtx.fillStyle = grad;
            curtainCtx.fill();
        }

        // Brushed 24K Gold Seam Trim along the curved inner leading edge
        curtainCtx.beginPath();
        curtainCtx.moveTo(topX[leadIdx], 0);
        curtainCtx.quadraticCurveTo(midX[leadIdx], ch * 0.52, botX[leadIdx], ch);
        curtainCtx.lineWidth = 4.5;
        curtainCtx.strokeStyle = '#D4AF37';
        curtainCtx.stroke();
    }

    // Subtle floating golden dust motes over the live curtain
    const moteAlpha = (1 - openProgress) * 0.55;
    if (moteAlpha > 0.02) {
        for (let i = 0; i < 28; i++) {
            const p = particles[i];
            if (!p) continue;
            curtainCtx.beginPath();
            curtainCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            curtainCtx.fillStyle = `rgba(${p.hue}, ${p.alpha * moteAlpha})`;
            curtainCtx.fill();
        }
    }
}

function renderCanvasFX(nLevel, tier, victoryActive, now) {
    ctx.clearRect(0, 0, cw, ch);
    const cx = cw / 2;
    const cy = ch / 2;

    // 1. Warm Volumetric Morning Sunbeams (Single shared gradient per frame for 60fps speed)
    const beamIntensity = victoryActive ? 0.28 : (tier > 0 ? 0.08 + tier * 0.045 : nLevel * 0.08);
    if (beamIntensity > 0.01) {
        sunbeamAngle += 0.0018 + (victoryActive ? 0.002 : tier * 0.0008);
        const rayCount = 12;
        const maxRadius = Math.max(cw, ch) * 0.85;
        const stepAngle = (Math.PI * 2) / rayCount;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(sunbeamAngle);

        const sharedGrad = ctx.createLinearGradient(0, 0, maxRadius, 0);
        sharedGrad.addColorStop(0, `rgba(212, 175, 55, ${beamIntensity})`);
        sharedGrad.addColorStop(0.6, `rgba(247, 231, 180, ${beamIntensity * 0.45})`);
        sharedGrad.addColorStop(1, 'rgba(252, 249, 244, 0)');
        ctx.fillStyle = sharedGrad;

        for (let i = 0; i < rayCount; i++) {
            ctx.rotate(stepAngle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(maxRadius, -maxRadius * 0.085);
            ctx.lineTo(maxRadius, maxRadius * 0.085);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    // 2. Ambient & Tier Acoustic Shockwave Rings
    const waveInterval = victoryActive ? 450 : (tier >= 3 ? 500 : 900);
    if ((nLevel > 0.25 || tier > 0 || victoryActive) && now - lastAmbientWave > waveInterval) {
        spawnShockwave(victoryActive ? 1.4 : (tier > 0 ? tier * 0.35 : nLevel * 0.5), 1);
        lastAmbientWave = now;
    }

    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.r += sw.speed;
        const progress = sw.r / sw.maxR;
        const currentAlpha = sw.alpha * (1 - progress);

        if (progress >= 1 || currentAlpha <= 0.005) {
            shockwaves.splice(i, 1);
            continue;
        }

        ctx.beginPath();
        ctx.arc(cx, cy, sw.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(180, 130, 25, ${currentAlpha})`;
        ctx.lineWidth = sw.lineWidth;
        ctx.stroke();
    }

    // 3. Rising Golden Light Motes
    const speedMult = victoryActive ? 2.4 : (1 + nLevel * 1.8 + tier * 0.7);
    const alphaMult = victoryActive ? 1.5 : (0.4 + nLevel * 0.8 + tier * 0.25);

    for (const p of particles) {
        p.y += p.vy * speedMult;
        p.x += p.vx;

        if (p.y < -10) {
            p.y = ch + 10;
            p.x = Math.random() * cw;
        }
        if (p.x < 0) p.x = cw;
        if (p.x > cw) p.x = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.hue}, ${Math.min(0.9, p.alpha * alphaMult)})`;
        ctx.fill();
    }

    // 4. Fast, Zero-Lag Final Victory Golden Confetti Shower
    if (victoryActive && confetti.length > 0) {
        for (const c of confetti) {
            c.y += c.vy;
            c.phase += 0.06;
            c.x += c.vx + Math.sin(c.phase) * 0.5;

            if (c.y > ch + 20) {
                c.y = -20;
                c.x = Math.random() * cw;
            }

            const currentW = Math.max(2, Math.abs(Math.cos(c.phase)) * c.w);
            ctx.fillStyle = c.color;
            ctx.fillRect(c.x - currentW / 2, c.y - c.h / 2, currentW, c.h);
        }
    }
}

function applyTypographyEffect(nLevel, tier, victoryActive, now) {
    if (victoryActive) {
        setWordEffectClass('final-victory-glory');
        const breath = 1.06 + Math.sin(now * 0.0035) * 0.025;
        textEl.style.transform = `translate3d(0, 0, 0) scale(${breath})`;
        textEl.style.opacity = '1';
        return;
    }

    if (tier >= 1 && tier <= 4) {
        setWordEffectClass(`tier-${tier}`);
        const baseScale = 1 + tier * 0.035;
        const pulse = Math.sin(now * (0.005 + tier * 0.0015)) * (0.01 * tier);
        textEl.style.transform = `translate3d(0, 0, 0) scale(${baseScale + pulse})`;
        textEl.style.opacity = '1';
    } else {
        setWordEffectClass('');
        const scale = 1 + nLevel * 0.08;
        textEl.style.transform = `translate3d(0, 0, 0) scale(${scale})`;
        textEl.style.opacity = String(0.88 + nLevel * 0.12);
    }
}

applyStageUI(0, false);
requestAnimationFrame(render);

