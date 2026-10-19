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
const audioOverlay = document.getElementById('audio-overlay');
const stepPills = document.querySelectorAll('.step-pill');
const meterTags = [
    document.getElementById('m-tier-1'),
    document.getElementById('m-tier-2'),
    document.getElementById('m-tier-3'),
    document.getElementById('m-tier-4')
];

// 4 Groups + Grand Finale Configuration
const STAGES = [
    {
        stage: 0,
        eyebrow: 'GROUP 01 // LIFT YOUR VOICE',
        word: 'JESUS',
        unlockMsg: 'GROUP 1 COMPLETE — UNLOCKING GROUP 2: "I AM FREE"'
    },
    {
        stage: 1,
        eyebrow: 'GROUP 02 // DECLARE YOUR FREEDOM',
        word: 'I AM FREE',
        unlockMsg: 'GROUP 2 COMPLETE — UNLOCKING GROUP 3: "HE IS RISEN"'
    },
    {
        stage: 2,
        eyebrow: 'GROUP 03 // PROCLAIM THE LIVING HOPE',
        word: 'HE IS RISEN',
        unlockMsg: 'GROUP 3 COMPLETE — UNLOCKING GROUP 4: "VICTORY"'
    },
    {
        stage: 3,
        eyebrow: 'GROUP 04 // SHOUT FOR THE FINAL UNLOCK',
        word: 'VICTORY',
        unlockMsg: 'ALL 4 GROUPS COMPLETE — UNLOCKING GRAND FINALE!'
    },
    {
        stage: 4,
        eyebrow: '★ GRAND FINALE UNLOCKED // WALK IN HIS PROMISE ★',
        word: 'NOTHING IS IMPOSSIBLE\nWITH GOD',
        unlockMsg: 'ALL PRAISE & GLORY FOREVER'
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
let achievementTimer = null;
let tier4StartTime = 0;
let displayAudioCtx = null;
let audioEnabled = false;

// State
let targetLevel = 0;
let currentLevel = 0;
let currentDb = 0;
let lastUpdate = Date.now();
let isManualOverride = false;

// --- INTERACTIVE CANVAS FX (Sunbeams, Shockwaves, Golden Particles) ---
const canvas = document.getElementById('fx-canvas');
const ctx = canvas.getContext('2d');
let cw = window.innerWidth;
let ch = window.innerHeight;
let shockwaves = [];
let particles = [];
let sunbeamAngle = 0;
let lastAmbientWave = 0;

function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    for (let i = 0; i < count; i++) {
        shockwaves.push({
            r: 40 + i * 28,
            maxR: Math.max(cw, ch) * (0.55 + intensity * 0.25),
            alpha: 0.42 + intensity * 0.12,
            speed: 5 + intensity * 4 + i * 1.2,
            lineWidth: 1.5 + intensity * 1.2
        });
    }
}

// Enable Audio on click
audioOverlay.addEventListener('click', () => {
    displayAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (displayAudioCtx.state === 'suspended') displayAudioCtx.resume();
    audioEnabled = true;
    audioOverlay.style.display = 'none';
});

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

function applyStageUI(stageIdx, animate = true) {
    const safeIdx = Math.max(0, Math.min(STAGES.length - 1, stageIdx));
    currentStage = safeIdx;
    const s = STAGES[safeIdx];

    eyebrowEl.textContent = s.eyebrow;
    textEl.setAttribute('data-stage', String(safeIdx));
    textEl.innerHTML = s.word.replace('\n', '<br>');

    if (animate) {
        textEl.classList.remove('word-transition');
        void textEl.offsetWidth; // Force reflow for clean animation restart
        textEl.classList.add('word-transition');
        spawnShockwave(1.5, 3);
    }

    // Update top stepper pills
    stepPills.forEach((pill, idx) => {
        pill.classList.remove('active', 'completed');
        if (idx < safeIdx) {
            pill.classList.add('completed');
        } else if (idx === safeIdx) {
            pill.classList.add('active');
        }
    });

    if (safeIdx === 4) {
        tierBadgeEl.textContent = '★ ALL GROUPS COMPLETE · GOD IS FAITHFUL ★';
        tierBadgeEl.style.color = '#996515';
        tierBadgeEl.style.borderColor = 'rgba(212, 175, 55, 0.5)';
        unlockContainer.classList.add('hidden');
    } else {
        updateTierBadge(currentTier, currentDb);
    }
}

function updateTierBadge(tier, db) {
    meterTags.forEach((tag, idx) => {
        if (tag) tag.classList.toggle('active', tier >= idx + 1);
    });

    if (currentStage === 4) {
        tierBadgeEl.textContent = '★ ALL GROUPS COMPLETE · GOD IS FAITHFUL ★';
        tierBadgeEl.style.color = '#996515';
        tierBadgeEl.style.borderColor = 'rgba(212, 175, 55, 0.55)';
        return;
    }

    if (tier > 0) {
        const t = TIER_THRESHOLDS.find(x => x.tier === tier);
        tierBadgeEl.textContent = t ? t.label : 'PRAISE UNLOCKED';
        tierBadgeEl.style.color = t ? t.color : '#996515';
        tierBadgeEl.style.borderColor = 'rgba(180, 83, 9, 0.45)';
    } else if (db >= 70) {
        tierBadgeEl.textContent = `BUILDING PRAISE · REACH 105 dB FOR TIER 1`;
        tierBadgeEl.style.color = '#575047';
        tierBadgeEl.style.borderColor = 'rgba(153, 101, 21, 0.22)';
    } else {
        tierBadgeEl.textContent = 'READY FOR PRAISE · TARGET 105–120 dB';
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
        currentTier = 0;
        targetLevel = 0;
        currentLevel = 0;
        currentDb = 0;
        isManualOverride = false;
        if (scorePeakEl) scorePeakEl.textContent = '0 dB';
        if (scoreLiveEl) scoreLiveEl.textContent = '0 dB';
        if (stageMeterFill) stageMeterFill.style.width = '0%';
        applyStageUI(0, true);
        lastUpdate = Date.now();
        return;
    }

    // Check if stage changed (via Remote group buttons or auto-unlock)
    if (typeof state.stage === 'number' && state.stage !== currentStage) {
        clearTierLock();
        currentTier = 0;
        applyStageUI(state.stage, true);
        if (state.stage === 4) {
            playFinaleFanfare();
        } else {
            playStageTransitionChime();
        }
    }

    const wasManualOverride = isManualOverride;
    isManualOverride = Boolean(state.manualOverride);
    targetLevel = typeof state.level === 'number' ? state.level : 0;
    currentDb = typeof state.db === 'number' ? state.db : 0;
    
    if (scorePeakEl) scorePeakEl.textContent = `${state.peak || 0} dB`;
    if (scoreLiveEl) scoreLiveEl.textContent = `${currentDb} dB`;

    const barPercent = Math.max(0, Math.min(100, ((currentDb - 40) / 90) * 100));
    if (stageMeterFill) stageMeterFill.style.width = `${barPercent}%`;
    
    // Determine Tier
    let newTier = 0;
    for (const t of TIER_THRESHOLDS) {
        if (currentDb >= t.db) {
            newTier = t.tier;
            break;
        }
    }

    if (isManualOverride) {
        if (newTier !== currentTier) {
            if (newTier > 0) {
                playAchievementSound(newTier);
                spawnShockwave(newTier * 0.45, newTier);
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
        spawnShockwave(newTier * 0.45, newTier);
        currentTier = newTier;

        if (achievementTimer) clearTimeout(achievementTimer);
        if (currentTier === 4 && currentStage < 4) {
            triggerTier4LockAndUnlock();
        }
        achievementTimer = setTimeout(() => {
            currentTier = 0;
            clearTierLock();
            updateTierBadge(0, currentDb);
        }, 10000);
    }

    updateTierBadge(currentTier, currentDb);
    lastUpdate = Date.now();
});

// --- WARM ARCHITECTURAL WORSHIP SOUND SYNTHESIZER ---
function playAchievementSound(tier) {
    if (!audioEnabled || !displayAudioCtx) return;
    if (displayAudioCtx.state === 'suspended') displayAudioCtx.resume();

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
    if (!audioEnabled || !displayAudioCtx) return;
    if (displayAudioCtx.state === 'suspended') displayAudioCtx.resume();
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

function playFinaleFanfare() {
    if (!audioEnabled || !displayAudioCtx) return;
    if (displayAudioCtx.state === 'suspended') displayAudioCtx.resume();
    const t = displayAudioCtx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
        const osc = displayAudioCtx.createOscillator();
        const gain = displayAudioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + idx * 0.09);
        gain.gain.setValueAtTime(0, t + idx * 0.09);
        gain.gain.linearRampToValueAtTime(0.14, t + idx * 0.09 + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 5.5);
        osc.connect(gain);
        gain.connect(displayAudioCtx.destination);
        osc.start(t + idx * 0.09);
        osc.stop(t + 5.8);
    });
}

// --- 60FPS RENDER LOOP ---
function render() {
    const now = Date.now();
    if (!isManualOverride && now - lastUpdate > 2000) {
        targetLevel = 0;
    }

    currentLevel += (targetLevel - currentLevel) * 0.35;
    const visualLevel = (currentTier > 0 || currentStage === 4) ? 100 : currentLevel;
    const nLevel = Math.max(0, Math.min(100, visualLevel)) / 100;

    // Update 10-second Tier 4 unlock progress bar if active
    if (tier4StartTime > 0 && currentTier === 4 && currentStage < 4) {
        const elapsed = now - tier4StartTime;
        const pct = Math.min(100, (elapsed / 10000) * 100);
        unlockFill.style.width = `${pct}%`;
    }

    renderCanvasFX(nLevel, currentTier, currentStage, now);
    applyTypographyEffect(nLevel, currentTier, currentStage);

    requestAnimationFrame(render);
}

function renderCanvasFX(nLevel, tier, stage, now) {
    ctx.clearRect(0, 0, cw, ch);
    const cx = cw / 2;
    const cy = ch / 2;

    // 1. Warm Volumetric Morning Sunbeams (Visible on high energy, Tiers 1-4, or Finale)
    const beamIntensity = stage === 4 ? 0.22 : (tier > 0 ? 0.08 + tier * 0.045 : nLevel * 0.08);
    if (beamIntensity > 0.01) {
        sunbeamAngle += 0.0015 + (tier * 0.0008);
        const rayCount = 12;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(sunbeamAngle);

        const maxRadius = Math.max(cw, ch) * 0.85;
        for (let i = 0; i < rayCount; i++) {
            const angle = (i / rayCount) * Math.PI * 2;
            ctx.save();
            ctx.rotate(angle);
            const grad = ctx.createLinearGradient(0, 0, maxRadius, 0);
            grad.addColorStop(0, `rgba(212, 175, 55, ${beamIntensity})`);
            grad.addColorStop(0.6, `rgba(247, 231, 180, ${beamIntensity * 0.4})`);
            grad.addColorStop(1, 'rgba(252, 249, 244, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(maxRadius, -maxRadius * 0.09);
            ctx.lineTo(maxRadius, maxRadius * 0.09);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    // 2. Ambient & Tier Acoustic Shockwave Rings
    if ((nLevel > 0.25 || tier > 0 || stage === 4) && now - lastAmbientWave > (tier >= 3 ? 450 : 900)) {
        spawnShockwave(tier > 0 ? tier * 0.35 : nLevel * 0.5, 1);
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

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, sw.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(180, 130, 25, ${currentAlpha})`;
        ctx.lineWidth = sw.lineWidth;
        ctx.stroke();
        ctx.restore();
    }

    // 3. Rising Golden Light Motes
    const speedMult = stage === 4 ? 2.4 : (1 + nLevel * 1.8 + tier * 0.7);
    const alphaMult = stage === 4 ? 1.4 : (0.4 + nLevel * 0.8 + tier * 0.25);

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
        ctx.fillStyle = `rgba(${p.hue}, ${Math.min(0.85, p.alpha * alphaMult)})`;
        ctx.fill();
    }
}

function applyTypographyEffect(nLevel, tier, stage) {
    // Keep wordtransition class if currently animating in
    const isTransitioning = textEl.classList.contains('word-transition');
    textEl.className = isTransitioning ? 'word-transition' : '';

    if (stage === 4) {
        textEl.classList.add('finale-glory');
        const breath = 1 + Math.sin(Date.now() * 0.0025) * 0.025;
        textEl.style.transform = `scale(${breath})`;
        textEl.style.opacity = '1';
        return;
    }

    if (tier >= 1 && tier <= 4) {
        textEl.classList.add(`tier-${tier}`);
        const baseScale = 1 + tier * 0.04;
        const pulse = Math.sin(Date.now() * (0.006 + tier * 0.002)) * (0.012 * tier);
        textEl.style.transform = `scale(${baseScale + pulse})`;
        textEl.style.opacity = '1';
    } else {
        // Sleek Morning Build-up before Tier 1
        const scale = 1 + nLevel * 0.08;
        textEl.style.transform = `scale(${scale})`;
        textEl.style.opacity = String(0.88 + nLevel * 0.12);
    }
}

applyStageUI(0, false);
requestAnimationFrame(render);

