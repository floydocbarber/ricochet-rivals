const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const BASE_PATH = '';
const ARENA_LAYOUTS = ['classic', 'corridors', 'open', 'fortress'];
const POWERUP_TYPES = ['rapid', 'shield', 'speed', 'triple'];
const POWERUP_SPAWN_MIN = 10000;
const POWERUP_SPAWN_MAX = 15000;
const POWERUP_LIFETIME = 15000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: `${BASE_PATH}/socket.io`
});

app.use(BASE_PATH, express.static(path.join(__dirname, '..', 'public')));
app.get(`${BASE_PATH}/room/:roomId`, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// --- Room System ---
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateRoomCode() : code;
}

function randomLayout() {
  return ARENA_LAYOUTS[Math.floor(Math.random() * ARENA_LAYOUTS.length)];
}

function randomPowerUpType() {
  return POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
}

// Power-up spawning for a room
function startPowerUpSpawner(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  function scheduleNext() {
    const delay = POWERUP_SPAWN_MIN + Math.random() * (POWERUP_SPAWN_MAX - POWERUP_SPAWN_MIN);
    room.powerUpTimer = setTimeout(() => {
      const r = rooms.get(roomId);
      if (!r || r.state !== 'playing') return;

      const id = r.nextPowerUpId++;
      const type = randomPowerUpType();
      // Random position in arena (logical coords, arena is roughly 40+8 to 760-8, 70+8 to 560-8)
      const x = 80 + Math.random() * 640;
      const y = 100 + Math.random() * 400;

      r.activePowerUps.set(id, { id, x, y, type });
      io.to(roomId).emit('powerup-spawn', { id, x, y, type });

      // Expire after lifetime
      setTimeout(() => {
        const rm = rooms.get(roomId);
        if (rm && rm.activePowerUps.has(id)) {
          rm.activePowerUps.delete(id);
          io.to(roomId).emit('powerup-expire', { id });
        }
      }, POWERUP_LIFETIME);

      scheduleNext();
    }, delay);
  }
  scheduleNext();
}

function stopPowerUpSpawner(roomId) {
  const room = rooms.get(roomId);
  if (room && room.powerUpTimer) {
    clearTimeout(room.powerUpTimer);
    room.powerUpTimer = null;
  }
}

function startRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const layout = randomLayout();
  room.state = 'playing';
  room.hp = { 1: 100, 2: 100 };
  room.layout = layout;
  room.activePowerUps = new Map();
  room.nextPowerUpId = 0;

  io.to(roomId).emit('game-start', {
    roomId,
    layout,
    players: room.players.map(p => ({ id: p.id, num: p.num }))
  });
  console.log(`Room ${roomId}: game starting (layout: ${layout})`);

  startPowerUpSpawner(roomId);
}

function cleanupRoom(roomId) {
  stopPowerUpSpawner(roomId);
  const room = rooms.get(roomId);
  if (room) {
    room.players.forEach(p => {
      const s = io.sockets.sockets.get(p.id);
      if (s) s.roomId = null;
    });
    rooms.delete(roomId);
    console.log(`Room ${roomId} deleted`);
  }
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('create-room', () => {
    const roomId = generateRoomCode();
    rooms.set(roomId, {
      players: [{ id: socket.id, num: 1 }],
      state: 'waiting',
      hp: { 1: 100, 2: 100 },
      rematchVotes: new Set(),
      activePowerUps: new Map(),
      nextPowerUpId: 0
    });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerNum = 1;
    socket.emit('room-created', { roomId });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on('join-room', (roomId) => {
    roomId = roomId.toUpperCase();
    const room = rooms.get(roomId);
    if (!room) return socket.emit('join-error', 'Room not found');
    if (room.players.length >= 2) return socket.emit('join-error', 'Room is full');
    if (room.state !== 'waiting') return socket.emit('join-error', 'Game already in progress');

    room.players.push({ id: socket.id, num: 2 });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerNum = 2;

    startRoom(roomId);
  });

  socket.on('player-state', (data) => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit('opponent-state', {
      playerNum: socket.playerNum,
      x: data.x, y: data.y,
      vx: data.vx, vy: data.vy,
      aimAngle: data.aimAngle
    });
  });

  socket.on('bullet-update', (data) => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit('bullet-update', data);
  });

  socket.on('bullet-destroy', (data) => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit('bullet-destroy', data);
  });

  socket.on('wall-hit', (data) => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit('wall-hit', data);
  });

  socket.on('hit-report', (data) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const targetNum = data.targetPlayerNum;
    const damage = data.damage;
    room.hp[targetNum] = Math.max(0, (room.hp[targetNum] || 0) - damage);
    io.to(socket.roomId).emit('hit-confirm', {
      targetPlayerNum: targetNum,
      damage,
      newHp: room.hp[targetNum],
      bulletId: data.bulletId
    });
    if (room.hp[targetNum] <= 0) {
      const winnerNum = targetNum === 1 ? 2 : 1;
      stopPowerUpSpawner(socket.roomId);
      io.to(socket.roomId).emit('round-end-server', { winnerNum });
    }
  });

  socket.on('powerup-collect', (data) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const pu = room.activePowerUps.get(data.id);
    if (pu) {
      room.activePowerUps.delete(data.id);
      io.to(socket.roomId).emit('powerup-collect', {
        id: data.id,
        type: pu.type,
        playerNum: socket.playerNum
      });
    }
  });

  socket.on('rematch', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (!room.rematchVotes) room.rematchVotes = new Set();
    room.rematchVotes.add(socket.id);
    if (room.rematchVotes.size >= 2) {
      room.rematchVotes.clear();
      stopPowerUpSpawner(socket.roomId);
      const layout = randomLayout();
      room.state = 'playing';
      room.hp = { 1: 100, 2: 100 };
      room.layout = layout;
      room.activePowerUps = new Map();
      room.nextPowerUpId = 0;
      io.to(socket.roomId).emit('rematch-start', { layout });
      startPowerUpSpawner(socket.roomId);
    } else {
      socket.to(socket.roomId).emit('rematch-requested');
    }
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        socket.to(socket.roomId).emit('opponent-disconnected');
        cleanupRoom(socket.roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎯 Ricochet Rivals running at http://localhost:${PORT}${BASE_PATH}/`);
});
