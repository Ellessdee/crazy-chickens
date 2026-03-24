// ============================================================
// Crazy Chickens — A Moorhuhn-style browser shooting game
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---- Sizing ----
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const W = () => canvas.width;
const H = () => canvas.height;

// ---- Background image ----
const bgImage = new Image();
bgImage.src = 'Gemini_Generated_Image_l8dqdwl8dqdwl8dq.png';
let bgLoaded = false;
bgImage.onload = () => { bgLoaded = true; };

// ---- Start screen background ----
const menuBgImage = new Image();
menuBgImage.src = 'unnamed-2.jpg';
let menuBgLoaded = false;
menuBgImage.onload = () => { menuBgLoaded = true; };

// ---- Start screen laptop image ----
const laptopImage = new Image();
laptopImage.src = '1.jpg.avif';
let laptopImgLoaded = false;
laptopImage.onload = () => { laptopImgLoaded = true; };

// ---- Game state ----
let state = 'menu'; // menu | playing | gameover
let score = 0;
let highScore = parseInt(localStorage.getItem('chickenHighScore') || '0', 10);
let timeLeft = 90;
let lastTime = 0;
let chickens = [];
let particles = [];
let feathers = [];
let shotEffects = [];
let mouseX = W() / 2;
let mouseY = H() / 2;
let ammo = 8;
const maxAmmo = 8;
let reloading = false;
let reloadTimer = 0;
const reloadTime = 1.2;
let comboCount = 0;
let comboTimer = 0;
let shakeTimer = 0;
let shakeIntensity = 0;
let poops = [];
let splatters = []; // splats on screen that fade
let poopMode = false; // toggle with P key
let poopCooldown = 0; // throw rate limiter

// ---- Audio context (lazy init) ----
let audioCtx = null;
function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playShot() {
    const ctx = getAudio();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    src.connect(gain).connect(ctx.destination);
    src.start();
}

function playHit() {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
}

function playEmpty() {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 120;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
}

function playReload() {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
}

function playPoopThrow() {
    const ctx = getAudio();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * 0.3 * Math.pow(1 - t, 2) *
                  Math.sin(t * 300) * (1 + Math.sin(t * 50) * 0.5);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(gain).connect(ctx.destination);
    src.start();
}

function playPoopSplat() {
    const ctx = getAudio();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.5) * 0.4 *
                  (1 + Math.sin(t * 180) * 0.3);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
}

function playGameOver() {
    const ctx = getAudio();
    [200, 160, 120].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.25);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.25);
        osc.stop(ctx.currentTime + i * 0.25 + 0.3);
    });
}

// ---- Character types (Simpsons-style humans) ----
const characterTypes = [
    { size: 1.0, speed: 1.0, points: 10, skin: '#ffd90f', shirt: '#ba4a00', pants: '#2855a0', hair: '#1a1a1a', shirtDetail: '#993d00', name: 'normal' },
    { size: 0.7, speed: 1.6, points: 25, skin: '#ffd90f', shirt: '#c0275e', pants: '#6a3570', hair: '#2244aa', shirtDetail: '#a02050', name: 'fast' },
    { size: 0.5, speed: 2.2, points: 50, skin: '#ffd90f', shirt: '#e8651a', pants: '#3377cc', hair: '#ffd90f', shirtDetail: '#cc5510', name: 'tiny' },
    { size: 1.4, speed: 0.6, points: 5, skin: '#ffd90f', shirt: '#f0f0f0', pants: '#555555', hair: '#776633', shirtDetail: '#ddd', name: 'fat' },
    { size: 0.6, speed: 2.8, points: 75, skin: '#ffd90f', shirt: '#cc0000', pants: '#1a1a1a', hair: '#cc2200', shirtDetail: '#aa0000', name: 'golden' },
];
const chickenTypes = characterTypes;

// ---- Character class (Simpsons-style) ----
class Chicken {
    constructor() {
        const type = characterTypes[Math.random() < 0.05 ? 4 : Math.random() < 0.15 ? 2 : Math.random() < 0.35 ? 1 : Math.random() < 0.6 ? 0 : 3];
        this.size = type.size;
        this.points = type.points;
        this.color = type.skin;
        this.skin = type.skin;
        this.shirt = type.shirt;
        this.shirtDetail = type.shirtDetail;
        this.pants = type.pants;
        this.hair = type.hair;
        this.name = type.name;
        const baseSize = 40 * this.size;
        this.w = baseSize * 2;
        this.h = baseSize * 2.8;
        this.dir = Math.random() < 0.5 ? 1 : -1;
        this.x = this.dir === 1 ? -this.w : W() + this.w;
        this.y = 40 + Math.random() * (H() * 0.45);
        this.speedX = (80 + Math.random() * 100) * type.speed * this.dir;
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 2 + Math.random() * 3;
        this.walkCycle = Math.random() * Math.PI * 2;
        this.walkSpeed = 6 + Math.random() * 4;
        this.alive = true;

        // Ragdoll death physics
        this.fallSpeedY = 0;
        this.fallSpeedX = 0;
        this.fallRotation = 0;
        this.rotVelocity = 0;
        this.bounceCount = 0;
        this.opacity = 1;

        // Personality — mostly unhappy
        this.hasBeard = Math.random() < 0.2;
        this.has5oClock = !this.hasBeard && Math.random() < 0.25;
        this.wrinkles = Math.random() < 0.3;
        this.baggyEyes = Math.random() < 0.4;
        this.sweatDrop = Math.random() < 0.2;
        // Expressions: 0=grumpy, 1=angry, 2=disgusted, 3=worried, 4=dead-inside
        this.expression = Math.floor(Math.random() * 5);
        // Mouth: 0=frown, 1=grimace, 2=yelling, 3=crooked
        this.mouthType = Math.floor(Math.random() * 4);
        // Hair variations
        this.baldSpot = this.name === 'fat' || Math.random() < 0.15;
        this.combOver = this.baldSpot && Math.random() < 0.5;
    }

    update(dt) {
        if (this.alive) {
            this.x += this.speedX * dt;
            this.wobble += this.wobbleSpeed * dt;
            this.y += Math.sin(this.wobble) * 20 * dt;
            this.walkCycle += this.walkSpeed * dt;
        } else {
            // Ragdoll physics
            this.fallSpeedY += 800 * dt; // strong gravity
            this.x += this.fallSpeedX * dt;
            this.y += this.fallSpeedY * dt;
            this.fallRotation += this.rotVelocity * dt;
            // Air drag on rotation
            this.rotVelocity *= (1 - 0.8 * dt);
            this.fallSpeedX *= (1 - 0.5 * dt);

            // Bounce off bottom
            if (this.y > H() - 60 && this.bounceCount < 3) {
                this.y = H() - 60;
                this.fallSpeedY *= -0.4; // energy loss on bounce
                this.fallSpeedX *= 0.7;
                this.rotVelocity += (Math.random() - 0.5) * 8;
                this.bounceCount++;
            }

            // Fade after bouncing
            if (this.bounceCount >= 2) {
                this.opacity -= 0.8 * dt;
            }
        }
    }

    kill() {
        this.alive = false;
        this.fallSpeedY = -200 - Math.random() * 150;
        this.fallSpeedX = (Math.random() - 0.5) * 200;
        this.rotVelocity = (Math.random() - 0.5) * 12;
        // Switch to death expression
        this.expression = 5; // dead
        this.mouthType = 2; // scream
    }

    isOffScreen() {
        if (this.alive) {
            return (this.dir === 1 && this.x > W() + this.w * 2) ||
                   (this.dir === -1 && this.x < -this.w * 2);
        }
        return this.opacity <= 0;
    }

    hitTest(mx, my) {
        if (!this.alive) return false;
        const dx = mx - this.x;
        const dy = my - this.y;
        return Math.abs(dx) < this.w * 0.6 && Math.abs(dy) < this.h * 0.5;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.opacity);
        ctx.translate(this.x, this.y);
        if (!this.alive) ctx.rotate(this.fallRotation);
        ctx.scale(this.dir, 1);

        const s = this.size;
        const OL = '#1a1a1a'; // outline color
        const lw = 2.2 * s;
        const walk = this.alive ? Math.sin(this.walkCycle) : 0;
        const walk2 = this.alive ? Math.cos(this.walkCycle) : 0;

        // === SHADOW (when alive) ===
        if (this.alive) {
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.ellipse(0, 44 * s, 20 * s, 5 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // === LEGS ===
        for (let leg = -1; leg <= 1; leg += 2) {
            const lx = leg * 7 * s;
            const legAngle = walk * leg * 0.3;
            ctx.save();
            ctx.translate(lx, 20 * s);
            ctx.rotate(legAngle);

            // Upper leg (pants)
            ctx.fillStyle = this.pants;
            ctx.strokeStyle = OL;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.roundRect(-5.5 * s, 0, 11 * s, 14 * s, 2 * s);
            ctx.fill();
            ctx.stroke();

            // Lower leg (pants)
            ctx.fillStyle = shadeColor(this.pants, -15);
            ctx.beginPath();
            ctx.roundRect(-5 * s, 12 * s, 10 * s, 10 * s, [0, 0, 2 * s, 2 * s]);
            ctx.fill();
            ctx.stroke();

            // Shoe — detailed
            ctx.fillStyle = '#2a2218';
            ctx.beginPath();
            ctx.moveTo(-5 * s, 21 * s);
            ctx.lineTo(10 * s, 21 * s);
            ctx.quadraticCurveTo(14 * s, 21 * s, 14 * s, 24 * s);
            ctx.lineTo(14 * s, 26 * s);
            ctx.quadraticCurveTo(14 * s, 28 * s, 10 * s, 28 * s);
            ctx.lineTo(-5 * s, 28 * s);
            ctx.quadraticCurveTo(-7 * s, 28 * s, -7 * s, 25 * s);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Shoe sole
            ctx.fillStyle = '#111';
            ctx.fillRect(-6 * s, 26 * s, 20 * s, 2.5 * s);
            // Shoe lace
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1 * s;
            ctx.beginPath();
            ctx.moveTo(0, 22 * s);
            ctx.lineTo(4 * s, 22 * s);
            ctx.stroke();

            ctx.restore();
        }

        // === TORSO ===
        ctx.strokeStyle = OL;
        ctx.lineWidth = lw;

        // Belly (slightly rounded for fat type)
        const bellyExtra = this.name === 'fat' ? 6 : 0;
        ctx.fillStyle = this.shirt;
        ctx.beginPath();
        ctx.moveTo(-16 * s, -10 * s);
        ctx.lineTo(-16 * s, 22 * s);
        ctx.lineTo(16 * s, 22 * s);
        ctx.lineTo(16 * s, -10 * s);
        // Belly bulge
        ctx.quadraticCurveTo((8 + bellyExtra) * s, -(12 + bellyExtra * 0.5) * s, -16 * s, -10 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Shirt wrinkles / fold lines
        ctx.strokeStyle = this.shirtDetail;
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.moveTo(-6 * s, 2 * s);
        ctx.quadraticCurveTo(-2 * s, 5 * s, -8 * s, 10 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(8 * s, 0);
        ctx.quadraticCurveTo(6 * s, 6 * s, 10 * s, 12 * s);
        ctx.stroke();

        // Belt
        ctx.fillStyle = '#3a2a18';
        ctx.strokeStyle = OL;
        ctx.lineWidth = lw;
        ctx.fillRect(-16 * s, 17 * s, 32 * s, 4 * s);
        ctx.strokeRect(-16 * s, 17 * s, 32 * s, 4 * s);
        // Belt buckle
        ctx.fillStyle = '#b8960f';
        ctx.fillRect(-2 * s, 17.5 * s, 4 * s, 3 * s);
        ctx.strokeStyle = '#8a7008';
        ctx.lineWidth = 1 * s;
        ctx.strokeRect(-2 * s, 17.5 * s, 4 * s, 3 * s);

        // Collar / neckline
        ctx.fillStyle = shadeColor(this.shirt, -25);
        ctx.strokeStyle = OL;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(-10 * s, -10 * s);
        ctx.quadraticCurveTo(-4 * s, -5 * s, 0, -3 * s);
        ctx.quadraticCurveTo(4 * s, -5 * s, 10 * s, -10 * s);
        ctx.lineTo(8 * s, -10 * s);
        ctx.quadraticCurveTo(0, -1 * s, -8 * s, -10 * s);
        ctx.closePath();
        ctx.fill();

        // === ARMS ===
        for (let arm = -1; arm <= 1; arm += 2) {
            const armAngle = walk2 * arm * 0.35;
            ctx.save();
            ctx.translate(arm * 16 * s, -4 * s);
            ctx.rotate(armAngle + (arm === -1 ? -0.1 : 0.1));

            // Sleeve
            ctx.fillStyle = this.shirt;
            ctx.strokeStyle = OL;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.roundRect(-5 * s, -2 * s, 10 * s, 14 * s, 3 * s);
            ctx.fill();
            ctx.stroke();

            // Forearm (skin)
            ctx.fillStyle = this.skin;
            ctx.beginPath();
            ctx.roundRect(-4 * s, 10 * s, 8 * s, 12 * s, 2 * s);
            ctx.fill();
            ctx.stroke();

            // Hand with fingers (Simpsons 4 fingers)
            ctx.fillStyle = this.skin;
            ctx.beginPath();
            ctx.arc(0, 24 * s, 5 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Finger lines
            ctx.strokeStyle = shadeColor(this.skin, -40);
            ctx.lineWidth = 0.8 * s;
            for (let f = 0; f < 3; f++) {
                const fa = -0.6 + f * 0.4;
                ctx.beginPath();
                ctx.moveTo(Math.cos(fa) * 3 * s, 24 * s + Math.sin(fa) * 3 * s);
                ctx.lineTo(Math.cos(fa) * 7 * s, 24 * s + Math.sin(fa) * 7 * s);
                ctx.stroke();
            }

            ctx.restore();
        }

        // === NECK ===
        ctx.fillStyle = this.skin;
        ctx.strokeStyle = OL;
        ctx.lineWidth = lw;
        ctx.fillRect(-6 * s, -18 * s, 12 * s, 10 * s);
        // Neck lines
        ctx.strokeStyle = shadeColor(this.skin, -30);
        ctx.lineWidth = 0.8 * s;
        ctx.beginPath();
        ctx.moveTo(-3 * s, -14 * s);
        ctx.lineTo(-2 * s, -10 * s);
        ctx.stroke();

        // Adam's apple
        ctx.fillStyle = shadeColor(this.skin, -10);
        ctx.beginPath();
        ctx.ellipse(2 * s, -13 * s, 2 * s, 3 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // === HEAD ===
        ctx.fillStyle = this.skin;
        ctx.strokeStyle = OL;
        ctx.lineWidth = lw;
        // Simpsons head: cylindrical top, jaw protrusion
        ctx.beginPath();
        ctx.moveTo(-17 * s, -25 * s);
        ctx.quadraticCurveTo(-18 * s, -50 * s, -10 * s, -52 * s);
        ctx.lineTo(10 * s, -52 * s);
        ctx.quadraticCurveTo(18 * s, -50 * s, 18 * s, -35 * s);
        // Jaw juts forward (overbite)
        ctx.quadraticCurveTo(19 * s, -25 * s, 22 * s, -22 * s);
        ctx.quadraticCurveTo(24 * s, -18 * s, 20 * s, -16 * s);
        // Chin
        ctx.quadraticCurveTo(14 * s, -14 * s, 8 * s, -16 * s);
        // Under chin
        ctx.quadraticCurveTo(0, -14 * s, -10 * s, -18 * s);
        ctx.quadraticCurveTo(-16 * s, -20 * s, -17 * s, -25 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // === EAR ===
        ctx.fillStyle = this.skin;
        ctx.beginPath();
        ctx.ellipse(-17 * s, -32 * s, 5 * s, 7 * s, -0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Inner ear
        ctx.strokeStyle = shadeColor(this.skin, -30);
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.arc(-17 * s, -32 * s, 3 * s, 0.5, Math.PI * 1.5);
        ctx.stroke();

        // === HAIR ===
        ctx.fillStyle = this.hair;
        ctx.strokeStyle = OL;
        ctx.lineWidth = lw;
        if (this.name === 'tiny') {
            // Bart-style spikes — 9 pointy spikes
            ctx.beginPath();
            ctx.moveTo(-12 * s, -48 * s);
            const spikes = 9;
            for (let i = 0; i < spikes; i++) {
                const sx = -12 * s + (i / (spikes - 1)) * 24 * s;
                const tipX = sx + (Math.random() - 0.3) * 2 * s;
                ctx.lineTo(tipX, -62 * s - Math.random() * 4 * s);
                if (i < spikes - 1) {
                    ctx.lineTo(sx + 12 * s / (spikes - 1), -48 * s);
                }
            }
            ctx.lineTo(12 * s, -48 * s);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (this.baldSpot) {
            // Homer-style: bald dome, fringe around sides
            // Side fringe
            ctx.fillStyle = this.hair;
            ctx.beginPath();
            ctx.moveTo(-18 * s, -28 * s);
            ctx.quadraticCurveTo(-20 * s, -35 * s, -18 * s, -40 * s);
            ctx.lineTo(-14 * s, -40 * s);
            ctx.quadraticCurveTo(-16 * s, -33 * s, -16 * s, -28 * s);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Combover strands
            if (this.combOver) {
                ctx.strokeStyle = this.hair;
                ctx.lineWidth = 2 * s;
                for (let h = 0; h < 3; h++) {
                    ctx.beginPath();
                    ctx.moveTo((-5 + h * 5) * s, -52 * s);
                    ctx.quadraticCurveTo((-3 + h * 4) * s, -56 * s, (h * 6) * s, -54 * s);
                    ctx.stroke();
                }
            } else {
                // Single zig-zag hair strand
                ctx.strokeStyle = this.hair;
                ctx.lineWidth = 2.5 * s;
                ctx.beginPath();
                ctx.moveTo(-2 * s, -52 * s);
                ctx.lineTo(0, -57 * s);
                ctx.lineTo(3 * s, -53 * s);
                ctx.stroke();
            }
            ctx.strokeStyle = OL;
        } else if (this.name === 'fast') {
            // Tall beehive / Marge-ish
            ctx.beginPath();
            ctx.roundRect(-10 * s, -76 * s, 20 * s, 30 * s, [8 * s, 8 * s, 2 * s, 2 * s]);
            ctx.fill();
            ctx.stroke();
            // Base hair
            ctx.beginPath();
            ctx.ellipse(0, -48 * s, 16 * s, 6 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Hair lines
            ctx.strokeStyle = shadeColor(this.hair, -30);
            ctx.lineWidth = 1 * s;
            for (let hl = 0; hl < 4; hl++) {
                const hy = -72 * s + hl * 7 * s;
                ctx.beginPath();
                ctx.moveTo(-7 * s, hy);
                ctx.quadraticCurveTo(0, hy - 2 * s, 7 * s, hy);
                ctx.stroke();
            }
        } else {
            // Generic messy/unkempt hair
            ctx.beginPath();
            ctx.moveTo(-16 * s, -40 * s);
            ctx.quadraticCurveTo(-14 * s, -56 * s, -4 * s, -56 * s);
            ctx.quadraticCurveTo(4 * s, -58 * s, 10 * s, -54 * s);
            ctx.quadraticCurveTo(16 * s, -52 * s, 16 * s, -42 * s);
            ctx.quadraticCurveTo(17 * s, -36 * s, 16 * s, -32 * s);
            ctx.lineTo(-16 * s, -32 * s);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Messy strands
            ctx.strokeStyle = shadeColor(this.hair, -20);
            ctx.lineWidth = 1.5 * s;
            ctx.beginPath();
            ctx.moveTo(-8 * s, -55 * s);
            ctx.quadraticCurveTo(-12 * s, -60 * s, -6 * s, -62 * s);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(6 * s, -54 * s);
            ctx.quadraticCurveTo(12 * s, -59 * s, 8 * s, -61 * s);
            ctx.stroke();
        }

        // === EYES — big Simpsons style ===
        ctx.strokeStyle = OL;
        ctx.lineWidth = lw;
        const eyeY = -35 * s;

        // Eyeballs (big, white, protruding)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(-4 * s, eyeY, 9 * s, 10 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(9 * s, eyeY, 9 * s, 10 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Bloodshot lines (unhappy detail)
        if (this.baggyEyes) {
            ctx.strokeStyle = '#cc4444';
            ctx.lineWidth = 0.5 * s;
            ctx.globalAlpha *= 0.4;
            for (let eye = 0; eye < 2; eye++) {
                const ex = eye === 0 ? -4 * s : 9 * s;
                for (let v = 0; v < 2; v++) {
                    const a = -1.5 + v * 0.8;
                    ctx.beginPath();
                    ctx.moveTo(ex + Math.cos(a) * 5 * s, eyeY + Math.sin(a) * 5 * s);
                    ctx.lineTo(ex + Math.cos(a) * 8 * s, eyeY + Math.sin(a) * 8 * s);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = Math.max(0, this.opacity);
        }

        // Pupils — looking forward with dead/angry stare
        ctx.fillStyle = '#000';
        const isDead = this.expression === 5;
        if (isDead) {
            // X eyes
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2 * s;
            for (let eye = 0; eye < 2; eye++) {
                const ex = eye === 0 ? -4 * s : 9 * s;
                ctx.beginPath();
                ctx.moveTo(ex - 4 * s, eyeY - 4 * s);
                ctx.lineTo(ex + 4 * s, eyeY + 4 * s);
                ctx.moveTo(ex + 4 * s, eyeY - 4 * s);
                ctx.lineTo(ex - 4 * s, eyeY + 4 * s);
                ctx.stroke();
            }
        } else {
            const pupilSize = 3.5 * s;
            const pupilX = 2 * s; // looking forward
            ctx.beginPath();
            ctx.arc(-4 * s + pupilX, eyeY, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(9 * s + pupilX, eyeY, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            // Tiny highlight
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(-4 * s + pupilX - 1 * s, eyeY - 1.5 * s, 1.2 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(9 * s + pupilX - 1 * s, eyeY - 1.5 * s, 1.2 * s, 0, Math.PI * 2);
            ctx.fill();
        }

        // Eyelids (heavy, droopy — unhappy)
        ctx.fillStyle = this.skin;
        ctx.strokeStyle = OL;
        ctx.lineWidth = lw;
        const lidDroop = this.expression === 4 ? 0.45 : // dead inside
                         this.expression === 0 ? 0.3 :  // grumpy
                         this.expression === 2 ? 0.25 :  // disgusted
                         this.expression === 3 ? 0.1 :   // worried
                         isDead ? 0 : 0.35;              // angry or dead
        if (lidDroop > 0 && !isDead) {
            for (let eye = 0; eye < 2; eye++) {
                const ex = eye === 0 ? -4 * s : 9 * s;
                ctx.beginPath();
                ctx.ellipse(ex, eyeY - 5 * s, 10 * s, 8 * s * lidDroop, 0, 0, Math.PI);
                ctx.fill();
            }
        }

        // Eyebrows — thick, expressive
        ctx.strokeStyle = OL;
        ctx.lineWidth = 3.5 * s;
        ctx.lineCap = 'round';
        const browAnger = this.expression === 1 ? 6 :   // angry
                          this.expression === 0 ? 3 :    // grumpy
                          this.expression === 2 ? 4 :    // disgusted
                          this.expression === 3 ? -3 :   // worried (raised)
                          isDead ? 0 : 2;
        // Left brow
        ctx.beginPath();
        ctx.moveTo(-13 * s, (-46 - browAnger) * s);
        ctx.quadraticCurveTo(-6 * s, (-48 + browAnger * 0.8) * s, 1 * s, (-45 + browAnger * 0.3) * s);
        ctx.stroke();
        // Right brow
        ctx.beginPath();
        ctx.moveTo(4 * s, (-45 + browAnger * 0.3) * s);
        ctx.quadraticCurveTo(10 * s, (-48 + browAnger * 0.5) * s, 16 * s, (-46 - browAnger * 0.6) * s);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Bags under eyes
        if (this.baggyEyes) {
            ctx.strokeStyle = shadeColor(this.skin, -25);
            ctx.lineWidth = 1.2 * s;
            for (let eye = 0; eye < 2; eye++) {
                const ex = eye === 0 ? -4 * s : 9 * s;
                ctx.beginPath();
                ctx.arc(ex, eyeY + 4 * s, 6 * s, 0.3, Math.PI - 0.3);
                ctx.stroke();
            }
        }

        // Wrinkles
        if (this.wrinkles) {
            ctx.strokeStyle = shadeColor(this.skin, -20);
            ctx.lineWidth = 0.8 * s;
            // Forehead
            ctx.beginPath();
            ctx.moveTo(-8 * s, -47 * s);
            ctx.quadraticCurveTo(0, -48 * s, 8 * s, -47 * s);
            ctx.stroke();
            // Nasolabial fold
            ctx.beginPath();
            ctx.moveTo(12 * s, -28 * s);
            ctx.quadraticCurveTo(14 * s, -22 * s, 12 * s, -18 * s);
            ctx.stroke();
        }

        // === NOSE — big Simpsons schnoz ===
        ctx.fillStyle = this.skin;
        ctx.strokeStyle = OL;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(6 * s, -30 * s);
        ctx.quadraticCurveTo(20 * s, -32 * s, 22 * s, -26 * s);
        ctx.quadraticCurveTo(23 * s, -22 * s, 18 * s, -22 * s);
        ctx.quadraticCurveTo(14 * s, -22 * s, 12 * s, -24 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Nostril
        ctx.fillStyle = shadeColor(this.skin, -35);
        ctx.beginPath();
        ctx.ellipse(17 * s, -24 * s, 2 * s, 1.5 * s, 0.3, 0, Math.PI * 2);
        ctx.fill();

        // === MOUTH — unhappy expressions ===
        ctx.strokeStyle = OL;
        ctx.lineWidth = lw;
        const mouthY = -18 * s;

        if (isDead) {
            // Wavy death mouth
            ctx.beginPath();
            ctx.moveTo(4 * s, mouthY);
            ctx.quadraticCurveTo(8 * s, mouthY + 3 * s, 11 * s, mouthY);
            ctx.quadraticCurveTo(14 * s, mouthY - 3 * s, 18 * s, mouthY);
            ctx.stroke();
            // Tongue hanging out
            ctx.fillStyle = '#cc3355';
            ctx.beginPath();
            ctx.ellipse(12 * s, mouthY + 3 * s, 3 * s, 5 * s, 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (this.mouthType === 0) {
            // Deep frown
            ctx.lineWidth = 2.5 * s;
            ctx.beginPath();
            ctx.moveTo(4 * s, mouthY);
            ctx.quadraticCurveTo(12 * s, mouthY + 8 * s, 20 * s, mouthY + 1 * s);
            ctx.stroke();
            // Overbite bump
            ctx.fillStyle = this.skin;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.ellipse(14 * s, mouthY - 1 * s, 7 * s, 3 * s, 0, 0, Math.PI);
            ctx.fill();
            ctx.strokeStyle = OL;
            ctx.stroke();
        } else if (this.mouthType === 1) {
            // Grimace with teeth
            ctx.fillStyle = '#4a0000';
            ctx.beginPath();
            ctx.moveTo(4 * s, mouthY - 2 * s);
            ctx.lineTo(20 * s, mouthY - 2 * s);
            ctx.quadraticCurveTo(21 * s, mouthY + 4 * s, 12 * s, mouthY + 5 * s);
            ctx.quadraticCurveTo(3 * s, mouthY + 4 * s, 4 * s, mouthY - 2 * s);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Teeth
            ctx.fillStyle = '#ffffee';
            ctx.fillRect(5 * s, mouthY - 2 * s, 14 * s, 3 * s);
            ctx.strokeRect(5 * s, mouthY - 2 * s, 14 * s, 3 * s);
            // Individual teeth lines
            ctx.lineWidth = 0.8 * s;
            for (let t = 0; t < 4; t++) {
                const tx = 7 * s + t * 3 * s;
                ctx.beginPath();
                ctx.moveTo(tx, mouthY - 2 * s);
                ctx.lineTo(tx, mouthY + 1 * s);
                ctx.stroke();
            }
        } else if (this.mouthType === 2) {
            // Yelling / screaming O
            ctx.fillStyle = '#3a0000';
            ctx.beginPath();
            ctx.ellipse(12 * s, mouthY + 1 * s, 7 * s, 6 * s, 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Teeth top
            ctx.fillStyle = '#ffffee';
            ctx.beginPath();
            ctx.ellipse(12 * s, mouthY - 3 * s, 5 * s, 2 * s, 0, 0, Math.PI);
            ctx.fill();
            ctx.stroke();
            // Uvula
            ctx.fillStyle = '#cc3355';
            ctx.beginPath();
            ctx.ellipse(12 * s, mouthY + 4 * s, 2 * s, 2.5 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Crooked frown
            ctx.lineWidth = 2.5 * s;
            ctx.beginPath();
            ctx.moveTo(4 * s, mouthY + 2 * s);
            ctx.quadraticCurveTo(10 * s, mouthY + 5 * s, 14 * s, mouthY);
            ctx.quadraticCurveTo(17 * s, mouthY - 2 * s, 20 * s, mouthY + 3 * s);
            ctx.stroke();
        }

        // === 5 O'CLOCK SHADOW ===
        if (this.has5oClock) {
            ctx.fillStyle = '#888';
            ctx.globalAlpha *= 0.15;
            ctx.beginPath();
            ctx.ellipse(10 * s, -17 * s, 14 * s, 8 * s, 0.1, 0, Math.PI);
            ctx.fill();
            ctx.globalAlpha = Math.max(0, this.opacity);
        }

        // === BEARD ===
        if (this.hasBeard) {
            ctx.fillStyle = shadeColor(this.hair, 20);
            ctx.strokeStyle = OL;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(2 * s, -18 * s);
            ctx.quadraticCurveTo(0, -10 * s, 6 * s, -8 * s);
            ctx.quadraticCurveTo(14 * s, -8 * s, 18 * s, -14 * s);
            ctx.quadraticCurveTo(20 * s, -18 * s, 16 * s, -18 * s);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Beard texture
            ctx.strokeStyle = shadeColor(this.hair, -10);
            ctx.lineWidth = 0.7 * s;
            for (let bl = 0; bl < 4; bl++) {
                const bx = 5 * s + bl * 3 * s;
                ctx.beginPath();
                ctx.moveTo(bx, -16 * s);
                ctx.lineTo(bx + 1 * s, -10 * s);
                ctx.stroke();
            }
        }

        // === SWEAT DROP ===
        if (this.sweatDrop && this.alive) {
            const sweatBob = Math.sin(this.walkCycle * 2) * 2 * s;
            ctx.fillStyle = '#66ccff';
            ctx.strokeStyle = OL;
            ctx.lineWidth = 1 * s;
            ctx.beginPath();
            ctx.moveTo(-14 * s, -40 * s + sweatBob);
            ctx.quadraticCurveTo(-18 * s, -36 * s + sweatBob, -14 * s, -33 * s + sweatBob);
            ctx.quadraticCurveTo(-10 * s, -36 * s + sweatBob, -14 * s, -40 * s + sweatBob);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
    }
}

// ---- Particles ----
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 200;
        this.vy = (Math.random() - 0.5) * 200 - 100;
        this.life = 0.5 + Math.random() * 0.5;
        this.maxLife = this.life;
        this.size = 2 + Math.random() * 4;
        this.color = color;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 400 * dt;
        this.life -= dt;
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

// ---- Feather particles ----
class Feather {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 120;
        this.vy = -50 - Math.random() * 80;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 8;
        this.life = 1.5 + Math.random();
        this.maxLife = this.life;
        this.size = 8 + Math.random() * 8;
        this.color = color;
        this.sway = Math.random() * Math.PI * 2;
    }
    update(dt) {
        this.sway += 3 * dt;
        this.x += this.vx * dt + Math.sin(this.sway) * 30 * dt;
        this.y += this.vy * dt;
        this.vy += 80 * dt;
        this.rotation += this.rotSpeed * dt;
        this.life -= dt;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size, this.size * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#00000033';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-this.size, 0);
        ctx.lineTo(this.size, 0);
        ctx.stroke();
        ctx.restore();
    }
}

// ---- Shot effect (muzzle flash ring) ----
class ShotEffect {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.life = 0.15;
        this.maxLife = 0.15;
    }
    update(dt) { this.life -= dt; }
    draw(ctx) {
        const t = 1 - this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = '#ffff88';
        ctx.lineWidth = 3 - t * 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, t * 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

// ---- Poop projectile with realistic physics ----
class Poop {
    constructor(startX, startY, targetX, targetY) {
        this.x = startX;
        this.y = startY;
        this.radius = 10 + Math.random() * 4;

        // Calculate launch velocity to actually reach the target
        const dx = targetX - startX;
        const dy = targetY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Use projectile motion formula to compute needed launch speed
        // Solve for v given target position and gravity
        const gravity = 350;
        const flightTime = Math.max(0.6, dist / 600); // estimated time of flight
        // vx = dx / t, vy = dy/t - 0.5*g*t (to counteract gravity)
        this.vx = dx / flightTime;
        this.vy = (dy / flightTime) - (0.5 * gravity * flightTime);

        // Physics constants
        this.gravity = gravity;
        this.airDrag = 0.12;      // light air drag
        this.windForce = (Math.random() - 0.5) * 20; // slight random wind

        // Rotation (spin)
        this.rotation = 0;
        this.spin = (Math.random() - 0.5) * 15; // rad/s

        // Trail
        this.trail = [];
        this.alive = true;
        this.splatted = false;

        // Squash & stretch
        this.squash = 1;
    }

    update(dt) {
        if (this.splatted) return;

        // Store trail position
        this.trail.push({ x: this.x, y: this.y, life: 0.3 });
        if (this.trail.length > 12) this.trail.shift();

        // Air resistance (quadratic drag approximation)
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > 0) {
            const dragForce = this.airDrag * speed * dt;
            this.vx -= (this.vx / speed) * dragForce;
            this.vy -= (this.vy / speed) * dragForce;
        }

        // Gravity
        this.vy += this.gravity * dt;

        // Wind
        this.vx += this.windForce * dt;

        // Position
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Rotation
        this.rotation += this.spin * dt;
        // Spin slows with drag
        this.spin *= (1 - 0.5 * dt);

        // Squash & stretch based on velocity direction
        const velAngle = Math.atan2(this.vy, this.vx);
        this.squash = 1 + Math.min(0.4, speed / 1500);

        // Decay trail
        this.trail.forEach(t => t.life -= dt);
        this.trail = this.trail.filter(t => t.life > 0);

        // Off-screen check (bottom or way off sides)
        if (this.y > H() + 50 || this.x < -100 || this.x > W() + 100) {
            this.alive = false;
        }
    }

    hitTest(chicken) {
        if (this.splatted || !chicken.alive) return false;
        const dx = this.x - chicken.x;
        const dy = this.y - chicken.y;
        const hitDist = this.radius + chicken.w * 0.4;
        return (dx * dx + dy * dy) < hitDist * hitDist;
    }

    splat() {
        this.splatted = true;
        this.alive = false;
    }

    draw(ctx) {
        if (this.splatted) return;

        // Draw trail
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const alpha = (t.life / 0.3) * 0.3;
            const trailSize = this.radius * 0.4 * (i / this.trail.length);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#6b4226';
            ctx.beginPath();
            ctx.arc(t.x, t.y, trailSize, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Squash & stretch along velocity direction
        const velAngle = Math.atan2(this.vy, this.vx);
        ctx.rotate(velAngle);
        ctx.scale(this.squash, 1 / this.squash);
        ctx.rotate(-velAngle);

        const r = this.radius;

        // Main poop body — lumpy irregular shape
        ctx.fillStyle = '#5c3317';
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Darker shading
        ctx.fillStyle = '#3e2210';
        ctx.beginPath();
        ctx.ellipse(r * 0.15, r * 0.15, r * 0.6, r * 0.45, 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = '#7a4a2a';
        ctx.beginPath();
        ctx.ellipse(-r * 0.2, -r * 0.2, r * 0.35, r * 0.25, -0.4, 0, Math.PI * 2);
        ctx.fill();

        // Stink lines (small wavy lines above)
        ctx.strokeStyle = '#8a7a40';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.5;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            const sx = i * r * 0.4;
            ctx.moveTo(sx, -r);
            ctx.quadraticCurveTo(sx + 3, -r - 5, sx - 2, -r - 10);
            ctx.quadraticCurveTo(sx + 4, -r - 15, sx, -r - 18);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.restore();
    }
}

// ---- Splatter on screen ----
class Splatter {
    constructor(x, y, size) {
        this.x = x;
        this.y = y;
        this.size = size || 30;
        this.life = 4.0; // fades over 4 seconds
        this.maxLife = 4.0;
        this.rotation = Math.random() * Math.PI * 2;
        // Generate random splat blobs
        this.blobs = [];
        const blobCount = 5 + Math.floor(Math.random() * 6);
        for (let i = 0; i < blobCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * this.size * 0.8;
            this.blobs.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist,
                r: 4 + Math.random() * (this.size * 0.4),
                color: Math.random() < 0.5 ? '#5c3317' : '#4a2810',
            });
        }
        // Drip trails
        this.drips = [];
        const dripCount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < dripCount; i++) {
            this.drips.push({
                x: (Math.random() - 0.5) * this.size,
                y: 0,
                targetY: 10 + Math.random() * 30,
                currentY: 0,
                width: 2 + Math.random() * 3,
            });
        }
    }

    update(dt) {
        this.life -= dt;
        // Animate drips
        for (const drip of this.drips) {
            if (drip.currentY < drip.targetY) {
                drip.currentY += 20 * dt;
            }
        }
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.min(1, this.life / (this.maxLife * 0.3));
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Draw splat blobs
        for (const blob of this.blobs) {
            ctx.fillStyle = blob.color;
            ctx.beginPath();
            ctx.ellipse(blob.x, blob.y, blob.r, blob.r * 0.7, Math.random(), 0, Math.PI * 2);
            ctx.fill();
        }

        // Center darker
        ctx.fillStyle = '#3e2210';
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 0.25, 0, Math.PI * 2);
        ctx.fill();

        ctx.rotate(-this.rotation);
        // Drips (always go downward regardless of rotation)
        ctx.fillStyle = '#5c3317';
        for (const drip of this.drips) {
            ctx.fillRect(drip.x - drip.width / 2, drip.y, drip.width, drip.currentY);
            // Drip blob at bottom
            ctx.beginPath();
            ctx.arc(drip.x, drip.currentY, drip.width * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

// ---- Floating score text ----
let floatingTexts = [];
class FloatingText {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 1.2;
        this.maxLife = 1.2;
    }
    update(dt) {
        this.y -= 40 * dt;
        this.life -= dt;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        const scale = 1 + (1 - this.life / this.maxLife) * 0.3;
        ctx.translate(this.x, this.y);
        ctx.scale(scale, scale);
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.font = 'bold 24px Arial Black, Arial';
        ctx.textAlign = 'center';
        ctx.strokeText(this.text, 0, 0);
        ctx.fillText(this.text, 0, 0);
        ctx.restore();
    }
}

// ---- Background drawing ----
function drawBackground() {
    const w = W(), h = H();

    if (bgLoaded) {
        // Draw image covering entire canvas, preserving aspect ratio
        const imgRatio = bgImage.width / bgImage.height;
        const canvasRatio = w / h;
        let drawW, drawH, drawX, drawY;
        if (canvasRatio > imgRatio) {
            // Canvas is wider — fit width, crop height
            drawW = w;
            drawH = w / imgRatio;
            drawX = 0;
            drawY = (h - drawH) / 2;
        } else {
            // Canvas is taller — fit height, crop width
            drawH = h;
            drawW = h * imgRatio;
            drawX = (w - drawW) / 2;
            drawY = 0;
        }
        ctx.drawImage(bgImage, drawX, drawY, drawW, drawH);
    } else {
        // Fallback solid color while loading
        ctx.fillStyle = '#2a8fd4';
        ctx.fillRect(0, 0, w, h);
    }
}

function drawClouds() {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.7;
    const cloudPositions = [
        { x: 0.1, y: 0.08, s: 1 },
        { x: 0.35, y: 0.15, s: 0.7 },
        { x: 0.55, y: 0.06, s: 1.2 },
        { x: 0.78, y: 0.2, s: 0.8 },
    ];
    for (const c of cloudPositions) {
        drawCloud(W() * c.x, H() * c.y, c.s);
    }
    ctx.globalAlpha = 1;
}

function drawCloud(x, y, scale) {
    const s = scale * 30;
    ctx.beginPath();
    ctx.arc(x, y, s * 1.2, 0, Math.PI * 2);
    ctx.arc(x + s * 1.5, y - s * 0.3, s, 0, Math.PI * 2);
    ctx.arc(x + s * 3, y, s * 1.1, 0, Math.PI * 2);
    ctx.arc(x + s * 1.5, y + s * 0.3, s * 0.9, 0, Math.PI * 2);
    ctx.fill();
}

function drawMountainRange(baseY, maxHeight, roughness, count) {
    const w = W();
    ctx.beginPath();
    ctx.moveTo(0, H());
    for (let i = 0; i <= count; i++) {
        const x = (i / count) * w;
        const peakH = maxHeight * (0.5 + Math.sin(i * 3.7) * 0.3 + Math.cos(i * 2.3) * 0.2);
        if (i % 2 === 0) {
            ctx.lineTo(x, baseY - peakH);
        } else {
            ctx.lineTo(x, baseY - peakH * 0.3);
        }
    }
    ctx.lineTo(w, H());
    ctx.closePath();
    ctx.fill();
}

function drawHills(baseY, maxHeight, count) {
    const w = W();
    ctx.beginPath();
    ctx.moveTo(0, H());
    ctx.moveTo(-50, baseY);
    for (let i = 0; i <= count; i++) {
        const x = (i / count) * (w + 100) - 50;
        const h = maxHeight * (0.6 + Math.sin(i * 2.1 + 0.5) * 0.4);
        ctx.quadraticCurveTo(x + (w / count) * 0.25, baseY - h, x + (w / count) * 0.5, baseY);
    }
    ctx.lineTo(w + 50, H());
    ctx.lineTo(-50, H());
    ctx.closePath();
    ctx.fill();
}

function drawTrees() {
    const w = W(), h = H();
    const treePositions = [0.05, 0.12, 0.22, 0.38, 0.52, 0.65, 0.75, 0.88, 0.95];
    for (const tx of treePositions) {
        const x = w * tx;
        const baseY = h * 0.84 + Math.sin(tx * 20) * 8;
        const treeH = 60 + Math.sin(tx * 13) * 20;
        // Trunk
        ctx.fillStyle = '#4a3520';
        ctx.fillRect(x - 5, baseY - treeH * 0.4, 10, treeH * 0.4);
        // Foliage
        ctx.fillStyle = '#1a5c10';
        ctx.beginPath();
        ctx.moveTo(x, baseY - treeH);
        ctx.lineTo(x + 25, baseY - treeH * 0.35);
        ctx.lineTo(x - 25, baseY - treeH * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, baseY - treeH * 0.75);
        ctx.lineTo(x + 30, baseY - treeH * 0.15);
        ctx.lineTo(x - 30, baseY - treeH * 0.15);
        ctx.closePath();
        ctx.fill();
    }
}

function drawFence() {
    const w = W(), h = H();
    const fenceY = h * 0.88;
    ctx.strokeStyle = '#5c4530';
    ctx.lineWidth = 3;
    // Horizontal bars
    ctx.beginPath();
    ctx.moveTo(0, fenceY);
    ctx.lineTo(w, fenceY);
    ctx.moveTo(0, fenceY + 15);
    ctx.lineTo(w, fenceY + 15);
    ctx.stroke();
    // Vertical posts
    ctx.fillStyle = '#5c4530';
    const postSpacing = 80;
    for (let x = 0; x < w; x += postSpacing) {
        ctx.fillRect(x - 4, fenceY - 10, 8, 40);
    }
}

// ---- HUD ----
function drawHUD() {
    const w = W(), h = H();

    // Score
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.font = 'bold 32px Arial Black, Arial';
    ctx.textAlign = 'left';
    ctx.strokeText(`Score: ${score}`, 20, 42);
    ctx.fillText(`Score: ${score}`, 20, 42);

    // High score
    ctx.font = 'bold 18px Arial Black, Arial';
    ctx.strokeText(`Best: ${highScore}`, 20, 68);
    ctx.fillText(`Best: ${highScore}`, 20, 68);

    // Timer
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px Arial Black, Arial';
    const timeColor = timeLeft <= 10 ? '#ff3333' : '#fff';
    ctx.fillStyle = timeColor;
    ctx.strokeText(`${Math.ceil(timeLeft)}`, w / 2, 42);
    ctx.fillText(`${Math.ceil(timeLeft)}`, w / 2, 42);

    // Ammo
    ctx.textAlign = 'right';
    const ammoY = 42;
    for (let i = 0; i < maxAmmo; i++) {
        const ax = w - 20 - i * 18;
        if (i < ammo) {
            // Full shell
            ctx.fillStyle = '#cc8800';
            ctx.fillRect(ax - 5, ammoY - 18, 10, 22);
            ctx.fillStyle = '#ff2200';
            ctx.beginPath();
            ctx.arc(ax, ammoY - 18, 5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Empty shell
            ctx.fillStyle = '#555';
            ctx.globalAlpha = 0.4;
            ctx.fillRect(ax - 5, ammoY - 18, 10, 22);
            ctx.globalAlpha = 1;
        }
    }

    // Reload indicator
    if (reloading) {
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 20px Arial Black, Arial';
        ctx.textAlign = 'center';
        const reloadProgress = 1 - reloadTimer / reloadTime;
        ctx.fillText('RELOADING...', w / 2, h - 60);
        ctx.fillStyle = '#333';
        ctx.fillRect(w / 2 - 60, h - 50, 120, 10);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(w / 2 - 60, h - 50, 120 * reloadProgress, 10);
    }

    // Mode indicator
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px Arial Black, Arial';
    ctx.lineWidth = 3;
    if (poopMode) {
        ctx.fillStyle = '#8B4513';
        ctx.strokeStyle = '#000';
        ctx.strokeText('POOP MODE [P]', w / 2, h - 20);
        ctx.fillText('POOP MODE [P]', w / 2, h - 20);
    } else {
        ctx.fillStyle = '#888';
        ctx.strokeStyle = '#000';
        ctx.font = '14px Arial, sans-serif';
        ctx.strokeText('[P] Poop Mode', w / 2, h - 20);
        ctx.fillText('[P] Poop Mode', w / 2, h - 20);
    }

    // Combo
    if (comboCount >= 2 && comboTimer > 0) {
        ctx.fillStyle = '#ffee00';
        ctx.strokeStyle = '#aa4400';
        ctx.lineWidth = 3;
        ctx.font = `bold ${28 + comboCount * 2}px Arial Black, Arial`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min(1, comboTimer * 2);
        ctx.strokeText(`COMBO x${comboCount}!`, w / 2, 90);
        ctx.fillText(`COMBO x${comboCount}!`, w / 2, 90);
        ctx.globalAlpha = 1;
    }
}

// ---- Crosshair ----
function drawCrosshair() {
    ctx.save();
    ctx.translate(mouseX, mouseY);

    if (poopMode && state === 'playing') {
        // Poop cursor — a small poop icon with arc indicator
        ctx.rotate(Math.sin(Date.now() / 200) * 0.1);
        const r = 10;
        // Poop shape
        ctx.fillStyle = '#5c3317';
        ctx.beginPath();
        ctx.arc(0, 2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a2810';
        ctx.beginPath();
        ctx.arc(0, -3, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6b4226';
        ctx.beginPath();
        ctx.arc(0, -8, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        // Stink lines
        ctx.strokeStyle = '#8a7a40';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        for (let i = -1; i <= 1; i++) {
            const wobble = Math.sin(Date.now() / 150 + i) * 3;
            ctx.beginPath();
            ctx.moveTo(i * 6, -14);
            ctx.quadraticCurveTo(i * 6 + wobble, -20, i * 6 - wobble, -26);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Arc trajectory preview (dotted line showing where poop will go)
        ctx.restore();
        ctx.save();
        if (state === 'playing') {
            const startX = W() / 2;
            const startY = H() - 30;
            const dx = mouseX - startX;
            const dy = mouseY - startY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const gravity = 350;
            const flightTime = Math.max(0.6, dist / 600);
            let pvx = dx / flightTime;
            let pvy = (dy / flightTime) - (0.5 * gravity * flightTime);
            let px = startX, py = startY;
            ctx.strokeStyle = '#5c331766';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 8]);
            ctx.beginPath();
            ctx.moveTo(px, py);
            for (let t = 0; t < 25; t++) {
                const sdt = 0.03;
                const spd = Math.sqrt(pvx * pvx + pvy * pvy);
                if (spd > 0) {
                    const drag = 0.12 * spd * sdt;
                    pvx -= (pvx / spd) * drag;
                    pvy -= (pvy / spd) * drag;
                }
                pvy += 350 * sdt;
                px += pvx * sdt;
                py += pvy * sdt;
                ctx.lineTo(px, py);
                if (py > H()) break;
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
    } else {
        // Normal gun crosshair
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        const size = 18;
        const gap = 5;
        ctx.beginPath();
        ctx.moveTo(-size, 0); ctx.lineTo(-gap, 0);
        ctx.moveTo(size, 0); ctx.lineTo(gap, 0);
        ctx.moveTo(0, -size); ctx.lineTo(0, -gap);
        ctx.moveTo(0, size); ctx.lineTo(0, gap);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.65, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// ---- Menu screen — hacker room image ----
function drawMenu() {
    const w = W(), h = H();
    const t = Date.now() / 1000;

    // === BACKGROUND — black fill first ===
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // === BACKGROUND IMAGE (contain-fit: show entire image) ===
    let dx = 0, dy = 0, dw = w, dh = h;
    if (menuBgLoaded) {
        const imgRatio = menuBgImage.width / menuBgImage.height;
        const canvasRatio = w / h;
        if (canvasRatio > imgRatio) {
            // Canvas wider than image — fit height, center horizontally
            dh = h * 0.72; // zoom out: only use 72% of height
            dw = dh * imgRatio;
            dx = (w - dw) / 2;
            dy = (h - dh) / 2;
        } else {
            // Canvas taller — fit width, center vertically
            dw = w * 0.88;
            dh = dw / imgRatio;
            dx = (w - dw) / 2;
            dy = (h - dh) / 2;
        }

        // Creepy jittery flicker — random brightness/offset glitches
        const flickerRand = Math.random();
        const isFlicker = flickerRand < 0.06; // 6% chance per frame
        const isDarkFlicker = flickerRand < 0.02; // 2% chance full dark

        if (isDarkFlicker) {
            // Brief total blackout
            ctx.globalAlpha = 0.05;
        } else if (isFlicker) {
            // Jittery offset + brightness spike
            dx += (Math.random() - 0.5) * 8;
            dy += (Math.random() - 0.5) * 6;
            ctx.globalAlpha = 0.6 + Math.random() * 0.4;
        }

        ctx.drawImage(menuBgImage, dx, dy, dw, dh);
        ctx.globalAlpha = 1;

        // Gradient fade to black — TOP
        const gradTop = ctx.createLinearGradient(0, dy - 10, 0, dy + dh * 0.18);
        gradTop.addColorStop(0, 'rgba(0,0,0,1)');
        gradTop.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradTop;
        ctx.fillRect(0, 0, w, dy + dh * 0.25);

        // Gradient fade to black — BOTTOM
        const gradBot = ctx.createLinearGradient(0, dy + dh * 0.82, 0, dy + dh + 10);
        gradBot.addColorStop(0, 'rgba(0,0,0,0)');
        gradBot.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = gradBot;
        ctx.fillRect(0, dy + dh * 0.75, w, h - dy - dh * 0.75);

        // Gradient fade — LEFT
        const gradLeft = ctx.createLinearGradient(dx - 5, 0, dx + dw * 0.08, 0);
        gradLeft.addColorStop(0, 'rgba(0,0,0,1)');
        gradLeft.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradLeft;
        ctx.fillRect(0, 0, dx + dw * 0.1, h);

        // Gradient fade — RIGHT
        const gradRight = ctx.createLinearGradient(dx + dw * 0.92, 0, dx + dw + 5, 0);
        gradRight.addColorStop(0, 'rgba(0,0,0,0)');
        gradRight.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = gradRight;
        ctx.fillRect(dx + dw * 0.9, 0, w - dx - dw * 0.9, h);

        // Creepy scanline overlay
        ctx.globalAlpha = 0.04;
        for (let sy = 0; sy < h; sy += 3) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, sy, w, 1);
        }
        ctx.globalAlpha = 1;

        // Occasional VHS tracking glitch bar
        if (Math.random() < 0.03) {
            const glitchY = Math.random() * h;
            const glitchH = 2 + Math.random() * 8;
            ctx.fillStyle = 'rgba(0,255,50,0.06)';
            ctx.fillRect(0, glitchY, w, glitchH);
            // Shift a strip of pixels
            ctx.drawImage(canvas, 0, glitchY, w, glitchH,
                         (Math.random() - 0.5) * 20, glitchY, w, glitchH);
        }
    }

    // === BAND-AID + LED — positioned relative to image draw area ===
    // Laptop webcam: top edge of laptop lid, center of screen
    const bandX = dx + dw * 0.37;
    const bandY = dy + dh * 0.155;
    const ledOn = Math.sin(t * 3) > 0.3;

    ctx.save();
    ctx.translate(bandX, bandY);
    ctx.rotate(0.12);
    const bScale = dw / 800; // scale band-aid relative to image size

    // Band-aid shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(-18 * bScale, -6 * bScale, 36 * bScale, 13 * bScale, 6 * bScale);
    ctx.fill();

    // Band-aid body
    ctx.fillStyle = '#d4a574';
    ctx.beginPath();
    ctx.roundRect(-17 * bScale, -7 * bScale, 34 * bScale, 12 * bScale, 5 * bScale);
    ctx.fill();
    ctx.strokeStyle = '#b8895a';
    ctx.lineWidth = 0.6 * bScale;
    ctx.stroke();

    // Gauze pad
    ctx.fillStyle = '#e8d8c4';
    ctx.fillRect(-7 * bScale, -5 * bScale, 14 * bScale, 8 * bScale);

    // Ventilation holes
    ctx.fillStyle = '#c49a6e';
    for (let bx = -4; bx <= 4; bx += 4) {
        for (let by = -2; by <= 2; by += 4) {
            ctx.beginPath();
            ctx.arc(bx * bScale, by * bScale, 0.8 * bScale, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Texture lines
    ctx.strokeStyle = '#c49a6e';
    ctx.lineWidth = 0.3 * bScale;
    ctx.beginPath();
    ctx.moveTo(-17 * bScale, -2 * bScale); ctx.lineTo(-8 * bScale, -2 * bScale);
    ctx.moveTo(-17 * bScale, 1 * bScale); ctx.lineTo(-8 * bScale, 1 * bScale);
    ctx.moveTo(8 * bScale, -2 * bScale); ctx.lineTo(17 * bScale, -2 * bScale);
    ctx.moveTo(8 * bScale, 1 * bScale); ctx.lineTo(17 * bScale, 1 * bScale);
    ctx.stroke();

    // LED glow through band-aid
    if (ledOn) {
        const bandGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, 14 * bScale);
        bandGlow.addColorStop(0, 'rgba(255, 30, 30, 0.45)');
        bandGlow.addColorStop(0.3, 'rgba(255, 30, 30, 0.15)');
        bandGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = bandGlow;
        ctx.beginPath();
        ctx.arc(0, 0, 14 * bScale, 0, Math.PI * 2);
        ctx.fill();

        // Brighter center
        ctx.fillStyle = 'rgba(255, 100, 100, 0.35)';
        ctx.beginPath();
        ctx.arc(0, 0, 4 * bScale, 0, Math.PI * 2);
        ctx.fill();

        // Light leaking around edges
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ff2222';
        ctx.beginPath();
        ctx.ellipse(-7 * bScale, 0, 2 * bScale, 5 * bScale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(7 * bScale, 0, 2 * bScale, 5 * bScale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    } else {
        ctx.fillStyle = 'rgba(80, 0, 0, 0.1)';
        ctx.beginPath();
        ctx.arc(0, 0, 8 * bScale, 0, Math.PI * 2);
        ctx.fill();
    }

    // Peeling corner
    ctx.fillStyle = '#ddb88a';
    ctx.beginPath();
    ctx.moveTo(15 * bScale, -7 * bScale);
    ctx.quadraticCurveTo(18 * bScale, -8 * bScale, 17.5 * bScale, -4.5 * bScale);
    ctx.lineTo(15 * bScale, -4.5 * bScale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.moveTo(15 * bScale, -4.5 * bScale);
    ctx.lineTo(17 * bScale, -4 * bScale);
    ctx.lineTo(15 * bScale, -3.5 * bScale);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // === MATRIX-STYLE FALLING CHARACTERS (subtle) ===
    ctx.font = '12px monospace';
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#00ff41';
    for (let i = 0; i < 20; i++) {
        const cx = Math.sin(i * 73.7) * 0.5 + 0.5;
        const chars = '01アイウエオカキクケコ';
        const ch = chars[Math.floor((t * 2 + i * 3) % chars.length)];
        const cy = ((t * 30 + i * 60) % h);
        ctx.fillText(ch, cx * w, cy);
    }
    ctx.globalAlpha = 1;

    // === UI TEXT — using the black areas above and below the image ===
    ctx.textAlign = 'center';

    // ---- TOP AREA (black gradient zone) ----

    // Title with glitch effect
    const titleSize = Math.min(64, w * 0.075);
    ctx.font = `bold ${titleSize}px Arial Black, Arial`;

    const glitch = Math.random() < 0.05;
    if (glitch) {
        ctx.fillStyle = '#ff0040';
        ctx.fillText('CREAZY CREEPS', w / 2 + 3, h * 0.16 - 2);
        ctx.fillStyle = '#00ffaa';
        ctx.fillText('CREAZY CREEPS', w / 2 - 3, h * 0.16 + 2);
    }
    ctx.fillStyle = '#00ff41';
    ctx.shadowColor = '#00ff41';
    ctx.shadowBlur = 25;
    ctx.fillText('CREAZY CREEPS', w / 2, h * 0.16);
    ctx.shadowBlur = 0;

    // Subtitle / tagline
    ctx.fillStyle = '#55cc55';
    ctx.font = `${Math.min(16, w * 0.02)}px monospace`;
    ctx.shadowColor = '#00ff41';
    ctx.shadowBlur = 6;
    ctx.fillText('> some creeps on an island are secretly running the world_', w / 2, h * 0.16 + 34);
    ctx.shadowBlur = 0;

    // ---- BOTTOM AREA (black gradient zone) ----

    // High score
    if (highScore > 0) {
        ctx.fillStyle = '#ff8800';
        ctx.shadowColor = '#ff8800';
        ctx.shadowBlur = 8;
        ctx.font = 'bold 22px monospace';
        ctx.fillText(`HIGH SCORE: ${highScore}`, w / 2, h * 0.83);
        ctx.shadowBlur = 0;
    }

    // Start prompt — big and pulsing
    const pulse = 0.5 + Math.sin(t * 4) * 0.5;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#00ff41';
    ctx.font = `bold ${Math.min(28, w * 0.035)}px monospace`;
    ctx.shadowColor = '#00ff41';
    ctx.shadowBlur = 15;
    ctx.fillText('[ CLICK TO START ]', w / 2, h * 0.89);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Controls info
    ctx.fillStyle = '#3a6a3a';
    ctx.font = `${Math.min(14, w * 0.018)}px monospace`;
    ctx.fillText('SHOOT creeps  |  R = reload  |  P = POOP MODE  |  90 sec', w / 2, h * 0.97);

    drawCrosshair();
}

// ---- Game over screen ----
function drawGameOver() {
    drawBackground();
    const w = W(), h = H();

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#ff3333';
    ctx.strokeStyle = '#440000';
    ctx.lineWidth = 5;
    ctx.font = `bold ${Math.min(60, w * 0.07)}px Arial Black, Arial`;
    ctx.textAlign = 'center';
    ctx.strokeText('TIME\'S UP!', w / 2, h * 0.28);
    ctx.fillText('TIME\'S UP!', w / 2, h * 0.28);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px Arial Black, Arial';
    ctx.strokeText(`Final Score: ${score}`, w / 2, h * 0.42);
    ctx.fillText(`Final Score: ${score}`, w / 2, h * 0.42);

    if (score >= highScore && score > 0) {
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 28px Arial Black, Arial';
        ctx.strokeText('NEW HIGH SCORE!', w / 2, h * 0.52);
        ctx.fillText('NEW HIGH SCORE!', w / 2, h * 0.52);
    } else {
        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 22px Arial Black, Arial';
        ctx.strokeText(`Best: ${highScore}`, w / 2, h * 0.52);
        ctx.fillText(`Best: ${highScore}`, w / 2, h * 0.52);
    }

    const pulse = 0.7 + Math.sin(Date.now() / 300) * 0.3;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.min(26, w * 0.035)}px Arial Black, Arial`;
    ctx.strokeText('Click to play again!', w / 2, h * 0.65);
    ctx.fillText('Click to play again!', w / 2, h * 0.65);
    ctx.globalAlpha = 1;

    drawCrosshair();
}

// ---- Spawn logic ----
let spawnTimer = 0;
function getSpawnInterval() {
    const elapsed = 90 - timeLeft;
    // Spawn faster as time goes on
    return Math.max(0.4, 1.8 - elapsed * 0.015);
}

// ---- Start game ----
function startGame() {
    state = 'playing';
    score = 0;
    timeLeft = 90;
    chickens = [];
    particles = [];
    feathers = [];
    shotEffects = [];
    floatingTexts = [];
    ammo = maxAmmo;
    reloading = false;
    reloadTimer = 0;
    comboCount = 0;
    comboTimer = 0;
    spawnTimer = 0;
    poops = [];
    splatters = [];
    poopCooldown = 0;
}

// ---- Shoot ----
function shoot() {
    if (state !== 'playing') return;
    if (reloading) return;

    if (ammo <= 0) {
        playEmpty();
        reload();
        return;
    }

    ammo--;
    playShot();
    shakeTimer = 0.08;
    shakeIntensity = 4;
    shotEffects.push(new ShotEffect(mouseX, mouseY));

    let hit = false;
    // Check chickens from front to back (last added = closest)
    for (let i = chickens.length - 1; i >= 0; i--) {
        const c = chickens[i];
        if (c.hitTest(mouseX, mouseY)) {
            c.kill();
            hit = true;

            // Points with combo
            comboTimer = 1.5;
            comboCount++;
            const multiplier = Math.min(comboCount, 5);
            const pts = c.points * multiplier;
            score += pts;

            // Effects
            playHit();
            floatingTexts.push(new FloatingText(c.x, c.y - 20,
                `+${pts}${multiplier > 1 ? ` (x${multiplier})` : ''}`,
                c.name === 'golden' ? '#ffdd00' : '#fff'));

            // Particles
            for (let p = 0; p < 12; p++) {
                particles.push(new Particle(c.x, c.y, c.color));
            }
            for (let f = 0; f < 5; f++) {
                feathers.push(new Feather(c.x, c.y, c.color));
            }

            break; // Only hit one chicken per shot
        }
    }

    if (!hit) {
        comboCount = 0;
    }

    if (ammo <= 0) {
        reload();
    }
}

function reload() {
    if (reloading || ammo === maxAmmo) return;
    reloading = true;
    reloadTimer = reloadTime;
}

// ---- Poop throwing ----
function throwPoop() {
    if (state !== 'playing') return;
    if (poopCooldown > 0) return;

    // Launch from bottom center of screen toward mouse
    const startX = W() / 2 + (Math.random() - 0.5) * 40;
    const startY = H() - 30;

    poops.push(new Poop(startX, startY, mouseX, mouseY));
    playPoopThrow();
    poopCooldown = 0.35; // throw rate limit
    shakeTimer = 0.05;
    shakeIntensity = 2;
}

// ---- Main loop ----
function gameLoop(timestamp) {
    const dt = Math.min(0.05, (timestamp - lastTime) / 1000);
    lastTime = timestamp;

    if (state === 'menu') {
        drawMenu();
    } else if (state === 'playing') {
        updateGame(dt);
        drawGame();
    } else if (state === 'gameover') {
        drawGameOver();
    }

    requestAnimationFrame(gameLoop);
}

function updateGame(dt) {
    // Timer
    timeLeft -= dt;
    if (timeLeft <= 0) {
        timeLeft = 0;
        state = 'gameover';
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('chickenHighScore', String(highScore));
        }
        playGameOver();
        return;
    }

    // Reload
    if (reloading) {
        reloadTimer -= dt;
        if (reloadTimer <= 0) {
            reloading = false;
            ammo = maxAmmo;
            playReload();
        }
    }

    // Combo decay
    if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) comboCount = 0;
    }

    // Screen shake
    if (shakeTimer > 0) shakeTimer -= dt;

    // Poop cooldown
    if (poopCooldown > 0) poopCooldown -= dt;

    // Update poops
    poops.forEach(p => p.update(dt));
    // Check poop-chicken collisions
    for (const poop of poops) {
        if (poop.splatted || !poop.alive) continue;
        for (let i = chickens.length - 1; i >= 0; i--) {
            const c = chickens[i];
            if (poop.hitTest(c)) {
                poop.splat();
                c.kill();

                // Points with combo
                comboTimer = 1.5;
                comboCount++;
                const multiplier = Math.min(comboCount, 5);
                const pts = c.points * multiplier;
                score += pts;

                // Effects
                playPoopSplat();
                floatingTexts.push(new FloatingText(c.x, c.y - 20,
                    `+${pts}${multiplier > 1 ? ` (x${multiplier})` : ''}`,
                    c.name === 'golden' ? '#ffdd00' : '#fff'));

                // Splatter on chicken position
                splatters.push(new Splatter(c.x, c.y, 25 + poop.radius));

                // Poop particles (brown)
                for (let p = 0; p < 15; p++) {
                    particles.push(new Particle(c.x, c.y,
                        Math.random() < 0.5 ? '#5c3317' : '#4a2810'));
                }
                // Feathers too
                for (let f = 0; f < 4; f++) {
                    feathers.push(new Feather(c.x, c.y, c.color));
                }

                break;
            }
        }
    }
    poops = poops.filter(p => p.alive);

    // Update splatters
    splatters.forEach(s => s.update(dt));
    splatters = splatters.filter(s => s.life > 0);

    // Spawn chickens
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
        chickens.push(new Chicken());
        spawnTimer = getSpawnInterval();
    }

    // Update chickens
    chickens.forEach(c => c.update(dt));
    chickens = chickens.filter(c => !c.isOffScreen());

    // Update particles
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => p.life > 0);

    feathers.forEach(f => f.update(dt));
    feathers = feathers.filter(f => f.life > 0);

    shotEffects.forEach(s => s.update(dt));
    shotEffects = shotEffects.filter(s => s.life > 0);

    floatingTexts.forEach(t => t.update(dt));
    floatingTexts = floatingTexts.filter(t => t.life > 0);
}

function drawGame() {
    ctx.save();

    // Screen shake
    if (shakeTimer > 0) {
        const sx = (Math.random() - 0.5) * shakeIntensity * 2;
        const sy = (Math.random() - 0.5) * shakeIntensity * 2;
        ctx.translate(sx, sy);
    }

    drawBackground();

    // Draw splatters (behind chickens)
    splatters.forEach(s => s.draw(ctx));

    // Draw chickens
    chickens.forEach(c => c.draw(ctx));

    // Draw poops in flight
    poops.forEach(p => p.draw(ctx));

    // Draw particles
    particles.forEach(p => p.draw(ctx));
    feathers.forEach(f => f.draw(ctx));
    shotEffects.forEach(s => s.draw(ctx));
    floatingTexts.forEach(t => t.draw(ctx));

    ctx.restore();

    drawHUD();
    drawCrosshair();
}

// ---- Utility ----
function shadeColor(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + percent));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
    return `rgb(${r},${g},${b})`;
}

// ---- Input ----
canvas.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    if (state === 'menu') {
        startGame();
    } else if (state === 'playing') {
        if (poopMode) {
            throwPoop();
        } else {
            shoot();
        }
    } else if (state === 'gameover') {
        state = 'menu';
    }
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', e => {
    if (e.key === 'r' || e.key === 'R') {
        if (state === 'playing') reload();
    }
    if (e.key === 'p' || e.key === 'P') {
        poopMode = !poopMode;
    }
});

// Prevent scrolling
window.addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault();
    }
});

// ---- Start ----
requestAnimationFrame(gameLoop);
