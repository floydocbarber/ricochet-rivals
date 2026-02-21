// === RICOCHET RIVALS — Phase 2 Polish: Arenas, Power-ups, Sound, Leaderboard ===
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Logical World Constants ---
const LOGICAL_W = 800;
const LOGICAL_H = 600;

// --- Game Constants ---
const PLAYER_RADIUS = 18;
const PLAYER_SPEED = 3.5;
const PROJECTILE_RADIUS = 5;
const MIN_SHOT_SPEED = 6;
const MAX_SHOT_SPEED = 14;
const MAX_CHARGE_MS = 1500;
const WALL_HP = 3;
const PLAYER_MAX_HP = 100;
const BASE_DAMAGE = 15;
const SHOOT_COOLDOWN = 400;
const AI_SHOOT_INTERVAL = 1800;
const TRAIL_LENGTH = 12;
const SYNC_INTERVAL = 50;
const BULLET_SYNC_INTERVAL = 33;

let scale = 1, offsetX = 0, offsetY = 0;
let W, H;
let ARENA;
let gameRunning = false;
let player, opponent, projectiles, walls, particles;
let keys = {};
let mouseLogical = { x: 0, y: 0 };
let charging = false, chargeStart = 0;
let lastPlayerShot = 0;
let scores = { player: 0, opponent: 0 };
let isMobile = false;
let joystickDir = { x: 0, y: 0 };
let fireTouch = null;
let nextBulletId = 0;

// --- Game Mode ---
let gameMode = 'ai';
let socket = null;
let myPlayerNum = 0;
let lastSyncTime = 0;
let lastBulletSyncTime = 0;
let remoteBullets = {};

// --- Arena Layout ---
let currentLayout = 'classic';

// --- Power-ups ---
let powerUps = [];
let powerUpTimer = 0;
let nextPowerUpId = 0;
const POWERUP_SPAWN_MIN = 10000;
const POWERUP_SPAWN_MAX = 15000;
const POWERUP_LIFETIME = 15000;
const POWERUP_RADIUS = 14;
const POWERUP_TYPES = [
  { type: 'rapid',  color: '#ffbe0b', icon: '⚡', label: 'RAPID FIRE' },
  { type: 'shield', color: '#3a86ff', icon: '🛡', label: 'SHIELD' },
  { type: 'speed',  color: '#00f5d4', icon: '💨', label: 'SPEED' },
  { type: 'triple', color: '#ff006e', icon: '🔱', label: 'TRIPLE' },
];

// Player active effects
let playerEffects = { rapid: 0, shield: false, speed: 0, triple: 0 };

// --- Sound System ---
let audioCtx = null;
let soundMuted = false;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type, params = {}) {
  if (soundMuted || !audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  gain.connect(audioCtx.destination);

  if (type === 'shoot') {
    const osc = audioCtx.createOscillator();
    const charge = params.charge || 0;
    osc.type = 'square';
    osc.frequency.setValueAtTime(300 + charge * 400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'bounce') {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200 + Math.random() * 800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.08);
  } else if (type === 'hit') {
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.2);
  } else if (type === 'wallbreak') {
    // Noise-like crumble
    const bufferSize = audioCtx.sampleRate * 0.3;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    noise.connect(gain);
    noise.start(now);
    noise.stop(now + 0.3);
  } else if (type === 'powerup') {
    // Sparkle chime - ascending notes
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600 + i * 200, now + i * 0.06);
      g.gain.setValueAtTime(0.1, now + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.15);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.15);
    }
  } else if (type === 'win') {
    [523, 659, 784].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.15, now + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.4);
    });
  } else if (type === 'lose') {
    [400, 300, 200].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.1, now + i * 0.2);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.3);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.3);
    });
  }
}

// --- Leaderboard ---
function getStats() {
  try {
    return JSON.parse(localStorage.getItem('ricochet-stats')) || { wins: 0, losses: 0 };
  } catch { return { wins: 0, losses: 0 }; }
}
function saveStats(stats) {
  localStorage.setItem('ricochet-stats', JSON.stringify(stats));
}
function recordWin() { const s = getStats(); s.wins++; saveStats(s); updateStatsDisplay(); }
function recordLoss() { const s = getStats(); s.losses++; saveStats(s); updateStatsDisplay(); }
function updateStatsDisplay() {
  const s = getStats();
  const el = document.getElementById('stats-display');
  if (el) el.textContent = `Wins: ${s.wins} | Losses: ${s.losses}`;
}

// --- Utility ---
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function normalize(v) { const m = Math.hypot(v.x, v.y) || 1; return { x: v.x / m, y: v.y / m }; }
function randomRange(a, b) { return a + Math.random() * (b - a); }

function logicalToScreen(lx, ly) {
  return { x: lx * scale + offsetX, y: ly * scale + offsetY };
}
function screenToLogical(sx, sy) {
  return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale };
}
function logicalDist(d) { return d * scale; }

// --- Arena Layouts ---
const ARENA_LAYOUTS = {
  classic: function(arena) {
    const cx = arena.x + arena.w / 2;
    const cy = arena.y + arena.h / 2;
    const iw = 12;
    const walls = [];
    walls.push({ x: cx - 60, y: cy - iw / 2, w: 120, h: iw, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: cx - iw / 2, y: cy - 60, w: iw, h: 120, hp: WALL_HP, maxHp: WALL_HP });
    const off = 100, bw = 80, bh = 12;
    walls.push({ x: arena.x + off, y: arena.y + off, w: bw, h: bh, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: arena.x + arena.w - off - bw, y: arena.y + off, w: bw, h: bh, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: arena.x + off, y: arena.y + arena.h - off - bh, w: bw, h: bh, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: arena.x + arena.w - off - bw, y: arena.y + arena.h - off - bh, w: bw, h: bh, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: cx - 150, y: cy - 80, w: iw, h: 50, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: cx + 150 - iw, y: cy + 30, w: iw, h: 50, hp: WALL_HP, maxHp: WALL_HP });
    return walls;
  },
  corridors: function(arena) {
    const walls = [];
    const iw = 10;
    const cx = arena.x + arena.w / 2;
    const cy = arena.y + arena.h / 2;
    // Horizontal corridors
    walls.push({ x: arena.x + 40, y: cy - 80, w: 200, h: iw, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: arena.x + arena.w - 240, y: cy - 80, w: 200, h: iw, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: arena.x + 40, y: cy + 70, w: 200, h: iw, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: arena.x + arena.w - 240, y: cy + 70, w: 200, h: iw, hp: WALL_HP, maxHp: WALL_HP });
    // Vertical dividers with gaps
    walls.push({ x: cx - iw / 2, y: arena.y + 20, w: iw, h: 100, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: cx - iw / 2, y: cy + 40, w: iw, h: 100, hp: WALL_HP, maxHp: WALL_HP });
    // Extra narrow passage walls
    walls.push({ x: arena.x + 140, y: arena.y + 30, w: iw, h: 80, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: arena.x + arena.w - 150, y: arena.y + 30, w: iw, h: 80, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: arena.x + 140, y: arena.y + arena.h - 110, w: iw, h: 80, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: arena.x + arena.w - 150, y: arena.y + arena.h - 110, w: iw, h: 80, hp: WALL_HP, maxHp: WALL_HP });
    // Center obstacles
    walls.push({ x: cx - 40, y: cy - iw / 2, w: 80, h: iw, hp: WALL_HP, maxHp: WALL_HP });
    return walls;
  },
  open: function(arena) {
    const cx = arena.x + arena.w / 2;
    const cy = arena.y + arena.h / 2;
    const iw = 12;
    const walls = [];
    // Just a few small obstacles
    walls.push({ x: cx - iw / 2, y: cy - 25, w: iw, h: 50, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: cx - 120, y: cy - iw / 2, w: 40, h: iw, hp: WALL_HP, maxHp: WALL_HP });
    walls.push({ x: cx + 80, y: cy - iw / 2, w: 40, h: iw, hp: WALL_HP, maxHp: WALL_HP });
    return walls;
  },
  fortress: function(arena) {
    const iw = 10;
    const walls = [];
    // Left fortress (player 1 side)
    const lx = arena.x + 60;
    const ly = arena.y + arena.h / 2;
    walls.push({ x: lx, y: ly - 60, w: 60, h: iw, hp: WALL_HP + 1, maxHp: WALL_HP + 1 });
    walls.push({ x: lx, y: ly + 50, w: 60, h: iw, hp: WALL_HP + 1, maxHp: WALL_HP + 1 });
    walls.push({ x: lx + 50, y: ly - 60, w: iw, h: 50, hp: WALL_HP + 1, maxHp: WALL_HP + 1 });
    walls.push({ x: lx + 50, y: ly + 10, w: iw, h: 50, hp: WALL_HP + 1, maxHp: WALL_HP + 1 });
    // Right fortress (player 2 side)
    const rx = arena.x + arena.w - 120;
    const ry = arena.y + arena.h / 2;
    walls.push({ x: rx, y: ry - 60, w: 60, h: iw, hp: WALL_HP + 1, maxHp: WALL_HP + 1 });
    walls.push({ x: rx, y: ry + 50, w: 60, h: iw, hp: WALL_HP + 1, maxHp: WALL_HP + 1 });
    walls.push({ x: rx, y: ry - 60, w: iw, h: 50, hp: WALL_HP + 1, maxHp: WALL_HP + 1 });
    walls.push({ x: rx, y: ry + 10, w: iw, h: 50, hp: WALL_HP + 1, maxHp: WALL_HP + 1 });
    // Center divider
    const cx = arena.x + arena.w / 2;
    const cy = arena.y + arena.h / 2;
    walls.push({ x: cx - iw / 2, y: cy - 40, w: iw, h: 80, hp: WALL_HP, maxHp: WALL_HP });
    return walls;
  }
};

function buildArena(layout) {
  const pad = 40;
  ARENA = { x: pad, y: pad + 30, w: LOGICAL_W - pad * 2, h: LOGICAL_H - pad * 2 - 30 };
  walls = [];
  const t = 8;
  // Border walls
  walls.push({ x: ARENA.x, y: ARENA.y, w: ARENA.w, h: t, hp: Infinity, maxHp: Infinity });
  walls.push({ x: ARENA.x, y: ARENA.y + ARENA.h - t, w: ARENA.w, h: t, hp: Infinity, maxHp: Infinity });
  walls.push({ x: ARENA.x, y: ARENA.y, w: t, h: ARENA.h, hp: Infinity, maxHp: Infinity });
  walls.push({ x: ARENA.x + ARENA.w - t, y: ARENA.y, w: t, h: ARENA.h, hp: Infinity, maxHp: Infinity });

  currentLayout = layout || 'classic';
  const layoutFn = ARENA_LAYOUTS[currentLayout] || ARENA_LAYOUTS.classic;
  walls.push(...layoutFn(ARENA));
}

// --- Socket.io Setup ---
function initSocket() {
  if (socket) return;
  socket = io({ path: '/socket.io' });

  socket.on('room-created', (data) => {
    const link = `${window.location.origin}/room/${data.roomId}`;
    document.getElementById('menu-buttons').style.display = 'none';
    document.getElementById('room-status').style.display = 'block';
    document.getElementById('room-status-text').innerHTML =
      `Waiting for opponent...<span class="room-code">${data.roomId}</span>` +
      `<span class="room-link">${link}</span>`;
    document.getElementById('room-status-text').onclick = () => {
      navigator.clipboard.writeText(link).then(() => {
        document.getElementById('room-status-text').innerHTML =
          `<span style="color:#00f5d4">Link copied!</span><span class="room-code">${data.roomId}</span>` +
          `<span class="room-link">${link}</span>`;
      });
    };
  });

  socket.on('join-error', (msg) => {
    const el = document.getElementById('join-error');
    el.style.display = 'block';
    el.textContent = msg;
    setTimeout(() => el.style.display = 'none', 3000);
  });

  socket.on('game-start', (data) => {
    myPlayerNum = data.players.find(p => p.id === socket.id).num;
    startGame('multi', data.layout);
  });

  socket.on('opponent-state', (data) => {
    if (!gameRunning || !opponent) return;
    opponent._targetX = data.x;
    opponent._targetY = data.y;
    opponent.vx = data.vx;
    opponent.vy = data.vy;
    opponent.aimAngle = data.aimAngle;
  });

  socket.on('bullet-update', (data) => {
    if (!gameRunning) return;
    for (const b of data.bullets) {
      if (!remoteBullets[b.id]) {
        remoteBullets[b.id] = {
          x: b.x, y: b.y, vx: b.vx, vy: b.vy,
          radius: PROJECTILE_RADIUS, owner: 'opponent',
          bounces: b.bounces, alive: true, trail: [],
          color: '#ff006e', _targetX: b.x, _targetY: b.y,
          id: b.id
        };
      } else {
        const rb = remoteBullets[b.id];
        rb._targetX = b.x;
        rb._targetY = b.y;
        rb.vx = b.vx;
        rb.vy = b.vy;
        rb.bounces = b.bounces;
      }
    }
  });

  socket.on('bullet-destroy', (data) => {
    if (!gameRunning) return;
    for (const id of data.ids) {
      if (remoteBullets[id]) remoteBullets[id].alive = false;
    }
  });

  socket.on('wall-hit', (data) => {
    if (!gameRunning) return;
    if (walls[data.index]) {
      walls[data.index].hp = data.hp;
      if (data.hp <= 0) {
        const w = walls[data.index];
        spawnParticles(w.x + w.w / 2, w.y + w.h / 2, '#ffbe0b', 15);
        playSound('wallbreak');
      }
    }
  });

  socket.on('hit-confirm', (data) => {
    if (!gameRunning) return;
    const isMe = data.targetPlayerNum === myPlayerNum;
    const target = isMe ? player : opponent;
    target.hp = data.newHp;
    spawnParticles(target.x, target.y, isMe ? '#3a86ff' : '#ff006e', 10);
    particles.push({
      x: target.x, y: target.y - 20, vx: 0, vy: -1.5,
      life: 1, color: '#fff', size: 0, text: `-${data.damage}`
    });
    playSound('hit');
  });

  socket.on('round-end-server', (data) => {
    if (!gameRunning) return;
    const winner = data.winnerNum === myPlayerNum ? 'player' : 'opponent';
    scores[winner]++;
    endRound(winner);
  });

  socket.on('rematch-requested', () => {
    const el = document.getElementById('go-rematch-status');
    el.style.display = 'block';
    el.textContent = 'Opponent wants a rematch!';
  });

  socket.on('rematch-start', (data) => {
    startGame('multi', data && data.layout);
  });

  socket.on('opponent-disconnected', () => {
    gameRunning = false;
    document.getElementById('disconnect-overlay').style.display = 'flex';
  });

  // Power-up sync from server
  socket.on('powerup-spawn', (data) => {
    if (!gameRunning) return;
    powerUps.push({
      id: data.id, x: data.x, y: data.y,
      type: data.type, spawnTime: performance.now(),
      lifetime: POWERUP_LIFETIME
    });
  });

  socket.on('powerup-collect', (data) => {
    if (!gameRunning) return;
    powerUps = powerUps.filter(p => p.id !== data.id);
    if (data.playerNum === myPlayerNum) {
      applyPowerUp(data.type);
    }
  });

  socket.on('powerup-expire', (data) => {
    if (!gameRunning) return;
    powerUps = powerUps.filter(p => p.id !== data.id);
  });
}

// --- Power-up Logic ---
function getRandomPowerUpPos() {
  // Find a position not inside walls
  for (let attempts = 0; attempts < 50; attempts++) {
    const x = ARENA.x + 30 + Math.random() * (ARENA.w - 60);
    const y = ARENA.y + 30 + Math.random() * (ARENA.h - 60);
    let valid = true;
    for (const w of walls) {
      if (w.hp <= 0) continue;
      if (x + POWERUP_RADIUS > w.x && x - POWERUP_RADIUS < w.x + w.w &&
          y + POWERUP_RADIUS > w.y && y - POWERUP_RADIUS < w.y + w.h) {
        valid = false; break;
      }
    }
    if (valid) return { x, y };
  }
  return { x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2 };
}

function spawnPowerUpLocal() {
  const typeInfo = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  const pos = getRandomPowerUpPos();
  powerUps.push({
    id: nextPowerUpId++,
    x: pos.x, y: pos.y,
    type: typeInfo.type,
    spawnTime: performance.now(),
    lifetime: POWERUP_LIFETIME
  });
}

function applyPowerUp(type) {
  playSound('powerup');
  const now = performance.now();
  if (type === 'rapid') {
    playerEffects.rapid = now + 8000;
    showEffectText('RAPID FIRE!', '#ffbe0b');
  } else if (type === 'shield') {
    playerEffects.shield = true;
    showEffectText('SHIELD!', '#3a86ff');
  } else if (type === 'speed') {
    playerEffects.speed = now + 8000;
    showEffectText('SPEED BOOST!', '#00f5d4');
  } else if (type === 'triple') {
    playerEffects.triple = 3;
    showEffectText('TRIPLE SHOT!', '#ff006e');
  }
}

function showEffectText(text, color) {
  particles.push({
    x: player.x, y: player.y - 35, vx: 0, vy: -1,
    life: 1.5, color, size: 0, text
  });
}

function updatePowerUps(dt) {
  const now = performance.now();

  // In AI mode, spawn locally
  if (gameMode === 'ai') {
    powerUpTimer -= dt;
    if (powerUpTimer <= 0) {
      spawnPowerUpLocal();
      powerUpTimer = randomRange(POWERUP_SPAWN_MIN, POWERUP_SPAWN_MAX);
    }
    // Expire old ones
    powerUps = powerUps.filter(p => now - p.spawnTime < p.lifetime);
  }

  // Check collection
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    if (dist(player, pu) < PLAYER_RADIUS + POWERUP_RADIUS) {
      if (gameMode === 'ai') {
        applyPowerUp(pu.type);
        powerUps.splice(i, 1);
      } else if (socket) {
        socket.emit('powerup-collect', { id: pu.id });
      }
    }
  }
}

function renderPowerUps() {
  const now = performance.now();
  for (const pu of powerUps) {
    const info = POWERUP_TYPES.find(t => t.type === pu.type);
    if (!info) continue;
    const age = now - pu.spawnTime;
    const fadeStart = pu.lifetime - 3000;
    const alpha = age > fadeStart ? 0.3 + 0.7 * (1 - (age - fadeStart) / 3000) : 1;
    const pulse = 1 + Math.sin(now / 200) * 0.15;

    ctx.globalAlpha = alpha;
    // Glow
    const glow = ctx.createRadialGradient(pu.x, pu.y, 0, pu.x, pu.y, POWERUP_RADIUS * 2.5 * pulse);
    glow.addColorStop(0, info.color + '60');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(pu.x - 40, pu.y - 40, 80, 80);

    // Circle
    ctx.fillStyle = info.color;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, POWERUP_RADIUS * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Icon
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.icon, pu.x, pu.y);

    ctx.globalAlpha = 1;
  }
}

// --- Entity Creation ---
function createPlayer(x, y, color, isAI = false) {
  return {
    x, y, vx: 0, vy: 0, radius: PLAYER_RADIUS, color,
    hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, isAI,
    lastShot: 0, aimAngle: 0, _targetX: x, _targetY: y
  };
}

function createProjectile(x, y, vx, vy, owner, id) {
  return {
    x, y, vx, vy, radius: PROJECTILE_RADIUS, owner,
    bounces: 0, alive: true, trail: [],
    color: owner === 'player' ? '#3a86ff' : '#ff006e',
    id: id !== undefined ? id : nextBulletId++
  };
}

// --- Collision ---
function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  return dist({ x: cx, y: cy }, { x: nx, y: ny }) < cr;
}

function reflectProjectile(p, wall, wallIndex) {
  const left = wall.x, right = wall.x + wall.w, top = wall.y, bottom = wall.y + wall.h;
  const overlapL = (p.x + p.radius) - left;
  const overlapR = right - (p.x - p.radius);
  const overlapT = (p.y + p.radius) - top;
  const overlapB = bottom - (p.y - p.radius);
  const minOverlap = Math.min(overlapL, overlapR, overlapT, overlapB);

  if (minOverlap === overlapL || minOverlap === overlapR) {
    p.vx *= -1;
    p.x += minOverlap === overlapL ? -overlapL : overlapR;
  } else {
    p.vy *= -1;
    p.y += minOverlap === overlapT ? -overlapT : overlapB;
  }
  p.bounces++;
  spawnParticles(p.x, p.y, p.color, 5);
  playSound('bounce');

  if (wall.hp !== Infinity) {
    wall.hp--;
    if (wall.hp <= 0) {
      spawnParticles(wall.x + wall.w / 2, wall.y + wall.h / 2, '#ffbe0b', 15);
      playSound('wallbreak');
    }
    if (gameMode === 'multi' && socket) {
      socket.emit('wall-hit', { index: wallIndex, hp: wall.hp });
    }
  }
}

// --- Particles ---
function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomRange(1, 4);
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 1, color, size: randomRange(2, 5)
    });
  }
}

// --- AI Logic ---
let aiMoveTimer = 0, aiMoveDir = { x: 0, y: 0 };

function updateAI(dt) {
  aiMoveTimer -= dt;
  if (aiMoveTimer <= 0) {
    aiMoveTimer = randomRange(500, 1500);
    const angle = Math.random() * Math.PI * 2;
    aiMoveDir = { x: Math.cos(angle), y: Math.sin(angle) };
    if (Math.random() < 0.4) {
      const toPlayer = normalize({ x: player.x - opponent.x, y: player.y - opponent.y });
      const flee = dist(player, opponent) < 150;
      aiMoveDir = flee ? { x: -toPlayer.x, y: -toPlayer.y } : toPlayer;
    }
  }

  opponent.vx = aiMoveDir.x * PLAYER_SPEED * 0.8;
  opponent.vy = aiMoveDir.y * PLAYER_SPEED * 0.8;

  const now = performance.now();
  if (now - opponent.lastShot > AI_SHOOT_INTERVAL) {
    opponent.lastShot = now;
    const angle = aiPickBounceAngle();
    const speed = randomRange(MIN_SHOT_SPEED, MAX_SHOT_SPEED * 0.7);
    projectiles.push(createProjectile(
      opponent.x + Math.cos(angle) * (opponent.radius + 8),
      opponent.y + Math.sin(angle) * (opponent.radius + 8),
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      'opponent'
    ));
  }
}

function aiPickBounceAngle() {
  const toPlayer = Math.atan2(player.y - opponent.y, player.x - opponent.x);
  return toPlayer + randomRange(-1.2, 1.2);
}

// --- Viewport ---
function updateScale() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;
  const scaleX = W / LOGICAL_W;
  const scaleY = H / LOGICAL_H;
  scale = Math.min(scaleX, scaleY);
  offsetX = (W - LOGICAL_W * scale) / 2;
  offsetY = (H - LOGICAL_H * scale) / 2;
}

// --- Game Loop ---
let lastTime = 0;

function gameLoop(time) {
  if (!gameRunning) return;
  const dt = Math.min(time - lastTime, 50);
  lastTime = time;
  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

function update(dt) {
  const now = performance.now();

  // Player movement
  let px = 0, py = 0;
  if (isMobile) {
    px = joystickDir.x; py = joystickDir.y;
  } else {
    if (keys['w'] || keys['arrowup']) py -= 1;
    if (keys['s'] || keys['arrowdown']) py += 1;
    if (keys['a'] || keys['arrowleft']) px -= 1;
    if (keys['d'] || keys['arrowright']) px += 1;
  }

  const speedMult = (playerEffects.speed > now) ? 1.5 : 1;
  if (px || py) {
    const n = normalize({ x: px, y: py });
    player.vx = n.x * PLAYER_SPEED * speedMult;
    player.vy = n.y * PLAYER_SPEED * speedMult;
  } else {
    player.vx *= 0.85;
    player.vy *= 0.85;
  }

  player.aimAngle = Math.atan2(mouseLogical.y - player.y, mouseLogical.x - player.x);

  // Opponent update
  if (gameMode === 'ai') {
    updateAI(dt);
  } else {
    if (opponent._targetX !== undefined) {
      opponent.x = lerp(opponent.x, opponent._targetX, 0.2);
      opponent.y = lerp(opponent.y, opponent._targetY, 0.2);
    }
  }

  const entitiesToMove = gameMode === 'ai' ? [player, opponent] : [player];
  entitiesToMove.forEach(e => {
    e.x += e.vx;
    e.y += e.vy;
    e.x = Math.max(ARENA.x + e.radius + 10, Math.min(ARENA.x + ARENA.w - e.radius - 10, e.x));
    e.y = Math.max(ARENA.y + e.radius + 10, Math.min(ARENA.y + ARENA.h - e.radius - 10, e.y));
    walls.forEach(w => {
      if (w.hp <= 0) return;
      if (circleRect(e.x, e.y, e.radius, w.x, w.y, w.w, w.h)) {
        const cx = Math.max(w.x, Math.min(e.x, w.x + w.w));
        const cy = Math.max(w.y, Math.min(e.y, w.y + w.h));
        const dx = e.x - cx, dy = e.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        e.x = cx + (dx / d) * (e.radius + 1);
        e.y = cy + (dy / d) * (e.radius + 1);
      }
    });
  });

  if (gameMode === 'multi') {
    opponent.x = Math.max(ARENA.x + opponent.radius + 10, Math.min(ARENA.x + ARENA.w - opponent.radius - 10, opponent.x));
    opponent.y = Math.max(ARENA.y + opponent.radius + 10, Math.min(ARENA.y + ARENA.h - opponent.radius - 10, opponent.y));
  }

  // Sync position
  if (gameMode === 'multi' && socket) {
    if (now - lastSyncTime > SYNC_INTERVAL) {
      lastSyncTime = now;
      socket.emit('player-state', {
        x: player.x, y: player.y,
        vx: player.vx, vy: player.vy,
        aimAngle: player.aimAngle
      });
    }
  }

  // Projectiles
  const destroyedBulletIds = [];
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.trail.unshift({ x: p.x, y: p.y });
    if (p.trail.length > TRAIL_LENGTH) p.trail.pop();

    for (let j = walls.length - 1; j >= 0; j--) {
      const w = walls[j];
      if (w.hp <= 0) continue;
      if (circleRect(p.x, p.y, p.radius, w.x, w.y, w.w, w.h)) {
        reflectProjectile(p, w, j);
        break;
      }
    }

    if (p.bounces >= 1) {
      if (dist(p, opponent) < p.radius + opponent.radius) {
        const damage = BASE_DAMAGE * p.bounces;
        if (gameMode === 'ai') {
          opponent.hp = Math.max(0, opponent.hp - damage);
          spawnParticles(opponent.x, opponent.y, '#ff006e', 10);
          particles.push({ x: opponent.x, y: opponent.y - 20, vx: 0, vy: -1.5, life: 1, color: '#fff', size: 0, text: `-${damage}` });
          playSound('hit');
          if (opponent.hp <= 0) { scores.player++; endRound('player'); }
        } else if (socket) {
          const opponentNum = myPlayerNum === 1 ? 2 : 1;
          socket.emit('hit-report', { targetPlayerNum: opponentNum, damage, bulletId: p.id });
        }
        p.alive = false;
      }

      if (p.alive && dist(p, player) < p.radius + player.radius) {
        if (playerEffects.shield) {
          playerEffects.shield = false;
          spawnParticles(player.x, player.y, '#3a86ff', 15);
          showEffectText('SHIELD BLOCKED!', '#3a86ff');
          p.alive = false;
        } else {
          const damage = BASE_DAMAGE * p.bounces;
          if (gameMode === 'ai') {
            player.hp = Math.max(0, player.hp - damage);
            spawnParticles(player.x, player.y, '#ffbe0b', 8);
            particles.push({ x: player.x, y: player.y - 20, vx: 0, vy: -1.5, life: 1, color: '#fff', size: 0, text: `-${damage} SELF` });
            playSound('hit');
            if (player.hp <= 0) { scores.opponent++; endRound('opponent'); }
          } else if (socket) {
            socket.emit('hit-report', { targetPlayerNum: myPlayerNum, damage, bulletId: p.id });
          }
          p.alive = false;
        }
      }
    }

    if (p.x < ARENA.x - 50 || p.x > ARENA.x + ARENA.w + 50 ||
        p.y < ARENA.y - 50 || p.y > ARENA.y + ARENA.h + 50) {
      p.alive = false;
    }
    p.vx *= 0.9995;
    p.vy *= 0.9995;
    if (Math.hypot(p.vx, p.vy) < 0.5) p.alive = false;
    if (!p.alive) destroyedBulletIds.push(p.id);
  }
  projectiles = projectiles.filter(p => p.alive);

  if (gameMode === 'multi' && socket && projectiles.length > 0) {
    if (now - lastBulletSyncTime > BULLET_SYNC_INTERVAL) {
      lastBulletSyncTime = now;
      socket.emit('bullet-update', {
        bullets: projectiles.map(p => ({
          id: p.id, x: p.x, y: p.y,
          vx: p.vx, vy: p.vy, bounces: p.bounces
        }))
      });
    }
  }

  if (gameMode === 'multi' && socket && destroyedBulletIds.length > 0) {
    socket.emit('bullet-destroy', { ids: destroyedBulletIds });
  }

  // Remote bullets
  if (gameMode === 'multi') {
    for (const id in remoteBullets) {
      const rb = remoteBullets[id];
      if (!rb.alive) { delete remoteBullets[id]; continue; }
      if (rb._targetX !== undefined) {
        rb.x = lerp(rb.x, rb._targetX, 0.3);
        rb.y = lerp(rb.y, rb._targetY, 0.3);
      }
      rb.trail.unshift({ x: rb.x, y: rb.y });
      if (rb.trail.length > TRAIL_LENGTH) rb.trail.pop();
    }
  }

  // Power-ups
  updatePowerUps(dt);

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.02;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // HUD
  document.getElementById('hp-player').style.width = (player.hp / player.maxHp * 100) + '%';
  document.getElementById('hp-ai').style.width = (opponent.hp / opponent.maxHp * 100) + '%';
  document.getElementById('score-player').textContent = `YOU: ${scores.player}`;
  document.getElementById('score-ai').textContent = `${gameMode === 'ai' ? 'AI' : 'RIVAL'}: ${scores.opponent}`;

  if (charging) {
    const pct = Math.min((now - chargeStart) / MAX_CHARGE_MS, 1) * 100;
    document.getElementById('charge-bar').style.width = pct + '%';
    document.getElementById('charge-bar-container').style.display = 'block';
  } else {
    document.getElementById('charge-bar-container').style.display = 'none';
  }
}

// --- Rendering ---
function render() {
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#0f0f2a';
  ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);

  // Grid
  ctx.strokeStyle = '#1a1a3a';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, ARENA.y); ctx.lineTo(x, ARENA.y + ARENA.h); ctx.stroke();
  }
  for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(ARENA.x, y); ctx.lineTo(ARENA.x + ARENA.w, y); ctx.stroke();
  }

  // Layout name
  ctx.fillStyle = '#333';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(currentLayout.toUpperCase(), ARENA.x + ARENA.w - 5, ARENA.y + 15);

  // Walls
  walls.forEach(w => {
    if (w.hp <= 0) return;
    const alpha = w.hp === Infinity ? 1 : w.hp / w.maxHp;
    if (w.hp === Infinity) {
      ctx.fillStyle = '#2a2a4a';
      ctx.strokeStyle = '#4a4a6a';
    } else {
      ctx.fillStyle = `rgba(255, 190, 11, ${0.3 + alpha * 0.5})`;
      ctx.strokeStyle = `rgba(255, 190, 11, ${0.5 + alpha * 0.5})`;
    }
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeRect(w.x, w.y, w.w, w.h);
    if (w.hp !== Infinity && w.hp < w.maxHp) {
      for (let i = 0; i < w.maxHp; i++) {
        ctx.fillStyle = i < w.hp ? '#ffbe0b' : '#333';
        const pipX = w.x + w.w / 2 - (w.maxHp * 6) / 2 + i * 6;
        ctx.fillRect(pipX, w.y - 5, 4, 3);
      }
    }
  });

  // Power-ups
  renderPowerUps();

  // All bullets
  const allBullets = [...projectiles];
  if (gameMode === 'multi') {
    for (const id in remoteBullets) {
      if (remoteBullets[id].alive) allBullets.push(remoteBullets[id]);
    }
  }

  // Trails
  allBullets.forEach(p => {
    if (p.trail.length < 2) return;
    for (let i = 1; i < p.trail.length; i++) {
      const alpha = (1 - i / p.trail.length) * 0.6;
      const width = (1 - i / p.trail.length) * p.radius * 2;
      if (p.color.startsWith('#')) {
        const r = parseInt(p.color.slice(1, 3), 16);
        const g = parseInt(p.color.slice(3, 5), 16);
        const b = parseInt(p.color.slice(5, 7), 16);
        ctx.strokeStyle = p.bounces === 0 ? `rgba(100,100,100,${alpha})` : `rgba(${r},${g},${b},${alpha})`;
      }
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
      ctx.lineTo(p.trail[i].x, p.trail[i].y);
      ctx.stroke();
    }
  });

  // Projectiles
  allBullets.forEach(p => {
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
    const baseColor = p.bounces === 0 ? '#666666' : p.color;
    glow.addColorStop(0, baseColor + '80');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - p.radius * 3, p.y - p.radius * 3, p.radius * 6, p.radius * 6);
    ctx.fillStyle = p.bounces === 0 ? '#666' : p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    if (p.bounces > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${p.bounces}x`, p.x, p.y - p.radius - 4);
    }
  });

  // Players
  [player, opponent].forEach(e => {
    const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius * 2.5);
    glow.addColorStop(0, e.color + '30');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(e.x - e.radius * 3, e.y - e.radius * 3, e.radius * 6, e.radius * 6);

    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Shield indicator
    if (e === player && playerEffects.shield) {
      ctx.strokeStyle = '#3a86ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Speed indicator
    if (e === player && playerEffects.speed > performance.now()) {
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    const aimLen = 35;
    const angle = e === player ? player.aimAngle :
      (e.isAI ? Math.atan2(player.y - opponent.y, player.x - opponent.x) + (Math.sin(performance.now() / 500) * 0.3) : e.aimAngle);
    ctx.strokeStyle = e.color + '80';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(angle) * e.radius, e.y + Math.sin(angle) * e.radius);
    ctx.lineTo(e.x + Math.cos(angle) * (e.radius + aimLen), e.y + Math.sin(angle) * (e.radius + aimLen));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    const label = e === player ? 'YOU' : (e.isAI ? 'AI' : 'RIVAL');
    ctx.fillText(label, e.x, e.y + 4);
  });

  // Particles
  particles.forEach(p => {
    if (p.text) {
      ctx.globalAlpha = Math.min(p.life, 1);
      ctx.fillStyle = p.color;
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }
  });

  // Charge preview
  if (charging) {
    const charge = Math.min((performance.now() - chargeStart) / MAX_CHARGE_MS, 1);
    const speed = MIN_SHOT_SPEED + charge * (MAX_SHOT_SPEED - MIN_SHOT_SPEED);
    ctx.strokeStyle = `rgba(58, 134, 255, ${0.2 + charge * 0.4})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    let sx = player.x + Math.cos(player.aimAngle) * (player.radius + 8);
    let sy = player.y + Math.sin(player.aimAngle) * (player.radius + 8);
    let svx = Math.cos(player.aimAngle) * speed;
    let svy = Math.sin(player.aimAngle) * speed;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let step = 0; step < 60; step++) {
      sx += svx; sy += svy;
      for (const w of walls) {
        if (w.hp <= 0) continue;
        if (sx > w.x && sx < w.x + w.w && sy > w.y && sy < w.y + w.h) {
          const dl = sx - w.x, dr = w.x + w.w - sx, dt = sy - w.y, db = w.y + w.h - sy;
          const m = Math.min(dl, dr, dt, db);
          if (m === dl || m === dr) svx *= -1; else svy *= -1;
        }
      }
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Active effects HUD (bottom-left of arena)
  renderActiveEffects();

  ctx.restore();
}

function renderActiveEffects() {
  const now = performance.now();
  const effects = [];
  if (playerEffects.rapid > now) effects.push({ label: '⚡RAPID', color: '#ffbe0b', time: Math.ceil((playerEffects.rapid - now) / 1000) });
  if (playerEffects.shield) effects.push({ label: '🛡SHIELD', color: '#3a86ff' });
  if (playerEffects.speed > now) effects.push({ label: '💨SPEED', color: '#00f5d4', time: Math.ceil((playerEffects.speed - now) / 1000) });
  if (playerEffects.triple > 0) effects.push({ label: `🔱TRIPLE x${playerEffects.triple}`, color: '#ff006e' });

  if (effects.length === 0) return;
  let y = ARENA.y + ARENA.h - 15;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  effects.forEach(e => {
    ctx.fillStyle = e.color;
    ctx.fillText(e.label + (e.time ? ` ${e.time}s` : ''), ARENA.x + 15, y);
    y -= 16;
  });
}

function endRound(winner) {
  gameRunning = false;
  if (winner === 'player') {
    recordWin();
    playSound('win');
  } else {
    recordLoss();
    playSound('lose');
  }
  const goEl = document.getElementById('game-over');
  const goText = document.getElementById('go-text');
  goText.textContent = winner === 'player' ? '🎯 YOU WIN!' : (gameMode === 'ai' ? '💀 AI WINS!' : '💀 RIVAL WINS!');
  goText.style.color = winner === 'player' ? '#00f5d4' : '#ff006e';
  document.getElementById('go-rematch-status').style.display = 'none';
  goEl.style.display = 'flex';
}

function startGame(mode, layout) {
  if (mode) gameMode = mode;
  initAudio();
  updateScale();
  document.getElementById('menu').style.display = 'none';
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('disconnect-overlay').style.display = 'none';
  canvas.style.display = 'block';
  document.getElementById('hud').classList.add('active');
  document.getElementById('btn-mute').style.display = 'block';

  isMobile = 'ontouchstart' in window && window.innerWidth < 800;
  document.getElementById('touch-controls').style.display = isMobile ? 'block' : 'none';

  // Pick layout
  if (layout) {
    buildArena(layout);
  } else if (gameMode === 'ai') {
    const layouts = Object.keys(ARENA_LAYOUTS);
    buildArena(layouts[Math.floor(Math.random() * layouts.length)]);
  } else {
    buildArena('classic');
  }

  const leftX = ARENA.x + 80, rightX = ARENA.x + ARENA.w - 80;
  const midY = ARENA.y + ARENA.h / 2;

  if (gameMode === 'multi') {
    if (myPlayerNum === 1) {
      player = createPlayer(leftX, midY, '#3a86ff');
      opponent = createPlayer(rightX, midY, '#ff006e');
    } else {
      player = createPlayer(rightX, midY, '#3a86ff');
      opponent = createPlayer(leftX, midY, '#ff006e');
    }
  } else {
    player = createPlayer(leftX, midY, '#3a86ff');
    opponent = createPlayer(rightX, midY, '#ff006e', true);
  }

  projectiles = [];
  remoteBullets = {};
  particles = [];
  powerUps = [];
  powerUpTimer = randomRange(POWERUP_SPAWN_MIN, POWERUP_SPAWN_MAX);
  playerEffects = { rapid: 0, shield: false, speed: 0, triple: 0 };
  charging = false;
  nextBulletId = myPlayerNum * 100000;
  nextPowerUpId = 0;

  gameRunning = true;
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// --- Menu Functions ---
function createRoom() {
  initSocket();
  socket.emit('create-room');
}

function joinRoom() {
  const code = document.getElementById('room-input').value.trim().toUpperCase();
  if (!code || code.length < 4) {
    const el = document.getElementById('join-error');
    el.style.display = 'block';
    el.textContent = 'Enter a 4-character room code';
    setTimeout(() => el.style.display = 'none', 3000);
    return;
  }
  initSocket();
  socket.emit('join-room', code);
}

function cancelRoom() {
  document.getElementById('menu-buttons').style.display = 'flex';
  document.getElementById('room-status').style.display = 'none';
  if (socket) { socket.disconnect(); socket = null; }
}

function backToMenu() {
  gameRunning = false;
  gameMode = 'ai';
  canvas.style.display = 'none';
  document.getElementById('hud').classList.remove('active');
  document.getElementById('btn-mute').style.display = 'none';
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('disconnect-overlay').style.display = 'none';
  document.getElementById('touch-controls').style.display = 'none';
  document.getElementById('menu').style.display = 'block';
  document.getElementById('menu-buttons').style.display = 'flex';
  document.getElementById('room-status').style.display = 'none';
  if (socket) { socket.disconnect(); socket = null; }
  scores = { player: 0, opponent: 0 };
  updateStatsDisplay();
}

function playAgain() {
  if (gameMode === 'multi') {
    socket.emit('rematch');
    document.getElementById('go-rematch-status').style.display = 'block';
    document.getElementById('go-rematch-status').textContent = 'Waiting for opponent...';
  } else {
    startGame('ai');
  }
}

function toggleMute() {
  soundMuted = !soundMuted;
  const btn = document.getElementById('btn-mute');
  if (btn) btn.textContent = soundMuted ? '🔇' : '🔊';
}

function checkRoomURL() {
  const match = window.location.pathname.match(/^\/ricochet-rivals\/room\/([A-Za-z0-9]{4,6})$/);
  if (match) {
    const code = match[1].toUpperCase();
    window.history.replaceState({}, '', '/');
    document.getElementById('room-input').value = code;
    initSocket();
    socket.on('connect', () => {
      socket.emit('join-room', code);
    });
  }
}

// --- Fire Projectile ---
function fireProjectile() {
  if (!gameRunning || !charging) return;
  charging = false;
  const now = performance.now();
  const cooldown = (playerEffects.rapid > now) ? SHOOT_COOLDOWN * 0.5 : SHOOT_COOLDOWN;
  if (now - lastPlayerShot < cooldown) return;
  lastPlayerShot = now;

  const charge = Math.min((now - chargeStart) / MAX_CHARGE_MS, 1);
  const speed = MIN_SHOT_SPEED + charge * (MAX_SHOT_SPEED - MIN_SHOT_SPEED);
  const angle = player.aimAngle;

  playSound('shoot', { charge });

  if (playerEffects.triple > 0) {
    playerEffects.triple--;
    const spread = 0.15; // radians
    [-spread, 0, spread].forEach(offset => {
      const a = angle + offset;
      const px = player.x + Math.cos(a) * (player.radius + 8);
      const py = player.y + Math.sin(a) * (player.radius + 8);
      projectiles.push(createProjectile(px, py, Math.cos(a) * speed, Math.sin(a) * speed, 'player'));
    });
  } else {
    const px = player.x + Math.cos(angle) * (player.radius + 8);
    const py = player.y + Math.sin(angle) * (player.radius + 8);
    projectiles.push(createProjectile(px, py, Math.cos(angle) * speed, Math.sin(angle) * speed, 'player'));
  }
}

// --- Input ---
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('resize', () => { if (gameRunning) updateScale(); });

canvas.addEventListener('mousemove', e => {
  mouseLogical = screenToLogical(e.clientX, e.clientY);
});
canvas.addEventListener('mousedown', e => {
  if (!gameRunning) return;
  initAudio();
  charging = true;
  chargeStart = performance.now();
});
canvas.addEventListener('mouseup', e => { fireProjectile(); });

// Touch controls
const joystickZone = document.getElementById('joystick-zone');
const joystickKnob = document.getElementById('joystick-knob');
const fireZone = document.getElementById('fire-zone');
let joystickTouch = null;

joystickZone.addEventListener('touchstart', e => { e.preventDefault(); joystickTouch = e.changedTouches[0].identifier; });
joystickZone.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joystickTouch) {
      const rect = joystickZone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = t.clientX - cx, dy = t.clientY - cy;
      const maxDist = rect.width / 2;
      const d = Math.min(Math.hypot(dx, dy), maxDist);
      const angle = Math.atan2(dy, dx);
      joystickDir = { x: Math.cos(angle) * (d / maxDist), y: Math.sin(angle) * (d / maxDist) };
      joystickKnob.style.transform = `translate(${Math.cos(angle) * d}px, ${Math.sin(angle) * d}px)`;
    }
  }
});
joystickZone.addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joystickTouch) {
      joystickTouch = null;
      joystickDir = { x: 0, y: 0 };
      joystickKnob.style.transform = '';
    }
  }
});

fireZone.addEventListener('touchstart', e => {
  e.preventDefault();
  if (!gameRunning) return;
  initAudio();
  fireTouch = e.changedTouches[0];
  charging = true;
  chargeStart = performance.now();
  mouseLogical = screenToLogical(fireTouch.clientX, fireTouch.clientY);
});
fireZone.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) mouseLogical = screenToLogical(t.clientX, t.clientY);
});
fireZone.addEventListener('touchend', e => { e.preventDefault(); fireProjectile(); });

canvas.addEventListener('contextmenu', e => e.preventDefault());
document.getElementById('room-input').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });

// Init
checkRoomURL();
updateStatsDisplay();
