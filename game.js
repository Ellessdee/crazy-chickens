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
        'P to toggle POOP MODE — throw poop with realistic physics!',
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
                c.alive = false;
                c.fallSpeed = -80;

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
