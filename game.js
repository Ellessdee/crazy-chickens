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

// ---- Chicken types ----
const chickenTypes = [
    { size: 1.0, speed: 1.0, points: 10, color: '#d4520a', name: 'normal' },
    { size: 0.7, speed: 1.6, points: 25, color: '#2288cc', name: 'fast' },
    { size: 0.5, speed: 2.2, points: 50, color: '#cc22aa', name: 'tiny' },
    { size: 1.4, speed: 0.6, points: 5, color: '#558822', name: 'fat' },
    { size: 0.6, speed: 2.8, points: 75, color: '#ffaa00', name: 'golden' },
];

// ---- Chicken class ----
class Chicken {
    constructor() {
        const type = chickenTypes[Math.random() < 0.05 ? 4 : Math.random() < 0.15 ? 2 : Math.random() < 0.35 ? 1 : Math.random() < 0.6 ? 0 : 3];
        this.size = type.size;
        this.points = type.points;
        this.color = type.color;
        this.name = type.name;
        const baseSize = 40 * this.size;
        this.w = baseSize * 2;
        this.h = baseSize * 1.5;
        this.dir = Math.random() < 0.5 ? 1 : -1;
        this.x = this.dir === 1 ? -this.w : W() + this.w;
        // Upper portion of screen mostly
        this.y = 40 + Math.random() * (H() * 0.55);
        this.speedX = (80 + Math.random() * 100) * type.speed * this.dir;
        this.speedY = Math.sin(Math.random() * Math.PI * 2) * 20;
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 2 + Math.random() * 3;
        this.wingAngle = 0;
        this.wingSpeed = 8 + Math.random() * 6;
        this.alive = true;
        this.fallSpeed = 0;
        this.fallRotation = 0;
        this.opacity = 1;
    }

    update(dt) {
        if (this.alive) {
            this.x += this.speedX * dt;
            this.wobble += this.wobbleSpeed * dt;
            this.y += Math.sin(this.wobble) * 30 * dt;
            this.wingAngle += this.wingSpeed * dt;
        } else {
            this.fallSpeed += 600 * dt;
            this.y += this.fallSpeed * dt;
            this.fallRotation += 5 * dt * this.dir;
            this.opacity -= 0.5 * dt;
        }
    }

    isOffScreen() {
        if (this.alive) {
            return (this.dir === 1 && this.x > W() + this.w * 2) ||
                   (this.dir === -1 && this.x < -this.w * 2);
        }
        return this.y > H() + 100 || this.opacity <= 0;
    }

    hitTest(mx, my) {
        if (!this.alive) return false;
        const dx = mx - this.x;
        const dy = my - this.y;
        return Math.abs(dx) < this.w * 0.6 && Math.abs(dy) < this.h * 0.6;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.opacity);
        ctx.translate(this.x, this.y);
        if (!this.alive) ctx.rotate(this.fallRotation);
        ctx.scale(this.dir, 1);

        const s = this.size;

        // Body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, 30 * s, 20 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#00000044';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Head
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(25 * s, -12 * s, 14 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eye
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(30 * s, -15 * s, 5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(32 * s, -15 * s, 2.5 * s, 0, Math.PI * 2);
        ctx.fill();

        // Beak
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.moveTo(37 * s, -10 * s);
        ctx.lineTo(48 * s, -8 * s);
        ctx.lineTo(37 * s, -5 * s);
        ctx.closePath();
        ctx.fill();

        // Comb (red thing on head)
        ctx.fillStyle = '#cc0000';
        ctx.beginPath();
        ctx.arc(22 * s, -25 * s, 5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(27 * s, -24 * s, 4 * s, 0, Math.PI * 2);
        ctx.fill();

        // Wattle
        ctx.fillStyle = '#cc0000';
        ctx.beginPath();
        ctx.ellipse(30 * s, -2 * s, 3 * s, 5 * s, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Wings
        const wingFlap = Math.sin(this.wingAngle) * 0.5;
        ctx.fillStyle = shadeColor(this.color, -20);
        ctx.save();
        ctx.translate(-5 * s, -5 * s);
        ctx.rotate(wingFlap - 0.3);
        ctx.beginPath();
        ctx.ellipse(0, 0, 12 * s, 22 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Tail feathers
        ctx.fillStyle = shadeColor(this.color, -30);
        for (let i = -1; i <= 1; i++) {
            ctx.save();
            ctx.translate(-30 * s, i * 5 * s);
            ctx.rotate(-0.3 + i * 0.15);
            ctx.beginPath();
            ctx.ellipse(0, 0, 15 * s, 4 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Feet
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 2 * s;
        ctx.lineCap = 'round';
        for (let f = -1; f <= 1; f += 2) {
            const footX = 5 * s * f;
            const legDangle = Math.sin(this.wingAngle * 0.5 + f) * 3;
            ctx.beginPath();
            ctx.moveTo(footX, 15 * s);
            ctx.lineTo(footX, 25 * s + legDangle);
            ctx.lineTo(footX + 6 * s, 28 * s + legDangle);
            ctx.moveTo(footX, 25 * s + legDangle);
            ctx.lineTo(footX - 4 * s, 28 * s + legDangle);
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

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#1a8aef');
    skyGrad.addColorStop(0.4, '#6bb8f7');
    skyGrad.addColorStop(0.7, '#b0d8f8');
    skyGrad.addColorStop(1, '#e8f0e0');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Sun
    ctx.fillStyle = '#fff4c0';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(w * 0.85, h * 0.12, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(w * 0.85, h * 0.12, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Clouds
    drawClouds();

    // Far mountains
    ctx.fillStyle = '#7799aa';
    drawMountainRange(h * 0.55, 200, 0.3, 5);

    // Near mountains
    ctx.fillStyle = '#557755';
    drawMountainRange(h * 0.65, 150, 0.5, 7);

    // Far hills
    ctx.fillStyle = '#448833';
    drawHills(h * 0.72, 80, 12);

    // Near hills / ground
    ctx.fillStyle = '#336622';
    drawHills(h * 0.82, 50, 8);

    // Ground
    const groundGrad = ctx.createLinearGradient(0, h * 0.85, 0, h);
    groundGrad.addColorStop(0, '#2d5a1e');
    groundGrad.addColorStop(1, '#1a3a10');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, h * 0.85, w, h * 0.15);

    // Trees
    drawTrees();

    // Fence
    drawFence();
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
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    const size = 18;
    const gap = 5;
    // Lines
    ctx.beginPath();
    ctx.moveTo(-size, 0); ctx.lineTo(-gap, 0);
    ctx.moveTo(size, 0); ctx.lineTo(gap, 0);
    ctx.moveTo(0, -size); ctx.lineTo(0, -gap);
    ctx.moveTo(0, size); ctx.lineTo(0, gap);
    ctx.stroke();
    // Circle
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.65, 0, Math.PI * 2);
    ctx.stroke();
    // Center dot
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ---- Menu screen ----
function drawMenu() {
    drawBackground();
    const w = W(), h = H();

    // Overlay
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = '#ffcc00';
    ctx.strokeStyle = '#663300';
    ctx.lineWidth = 6;
    ctx.font = `bold ${Math.min(72, w * 0.08)}px Arial Black, Arial`;
    ctx.textAlign = 'center';
    ctx.strokeText('CRAZY CHICKENS', w / 2, h * 0.3);
    ctx.fillText('CRAZY CHICKENS', w / 2, h * 0.3);

    // Subtitle
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.font = `bold ${Math.min(24, w * 0.03)}px Arial Black, Arial`;
    ctx.strokeText('A Moorhuhn-style shooting game', w / 2, h * 0.3 + 40);
    ctx.fillText('A Moorhuhn-style shooting game', w / 2, h * 0.3 + 40);

    // High score
    if (highScore > 0) {
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 22px Arial Black, Arial';
        ctx.strokeText(`High Score: ${highScore}`, w / 2, h * 0.45);
        ctx.fillText(`High Score: ${highScore}`, w / 2, h * 0.45);
    }

    // Start prompt
    const pulse = 0.7 + Math.sin(Date.now() / 300) * 0.3;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.min(30, w * 0.04)}px Arial Black, Arial`;
    ctx.strokeText('Click anywhere to start!', w / 2, h * 0.58);
    ctx.fillText('Click anywhere to start!', w / 2, h * 0.58);
    ctx.globalAlpha = 1;

    // Instructions
    ctx.fillStyle = '#ddd';
    ctx.font = `${Math.min(16, w * 0.02)}px Arial, sans-serif`;
    const instructions = [
        'Shoot the chickens! Smaller = more points',
        'R to reload  |  8 shells per clip  |  90 seconds',
        'Golden chickens are worth 75 points!',
    ];
    instructions.forEach((line, i) => {
        ctx.fillText(line, w / 2, h * 0.68 + i * 25);
    });

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
            c.alive = false;
            c.fallSpeed = -100;
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

    // Draw chickens
    chickens.forEach(c => c.draw(ctx));

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
        shoot();
    } else if (state === 'gameover') {
        state = 'menu';
    }
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', e => {
    if (e.key === 'r' || e.key === 'R') {
        if (state === 'playing') reload();
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
