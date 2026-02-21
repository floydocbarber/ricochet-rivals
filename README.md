# 🎯 Ricochet Rivals

A top-down 2D arena combat game where **projectiles must bounce off walls before they can deal damage**. More bounces = more damage!

![Neon arena combat with bouncing projectiles](https://img.shields.io/badge/status-Phase%201%20Complete-brightgreen)

## 🎮 How to Play

- **WASD** — Move your character
- **Mouse** — Aim direction
- **Hold Click** — Charge shot power
- **Release** — Fire!
- 📱 Touch controls on mobile (virtual joystick + fire button)

### Core Mechanic
Projectiles are **harmless until they bounce off a wall**. After bouncing:
- **1 bounce** = 1× damage (15 HP)
- **2 bounces** = 2× damage (30 HP)
- **3 bounces** = 3× damage (45 HP)
- Be careful — your own shots can hit you too!

### Destructible Walls
Interior walls break after taking hits, changing the arena as the match progresses.

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

## 🛠 Tech Stack

- **Frontend:** HTML5 Canvas + vanilla JavaScript
- **Backend:** Node.js + Express + Socket.io
- **Zero dependencies** on the client side
- Mobile responsive with touch controls

## Features

### ✅ Phase 1 (Complete)
- Single player vs AI opponent
- Arena with destructible interior walls
- Projectile physics with proper wall reflection
- Charge-to-fire power mechanic with trajectory preview
- Health bars & score tracking
- Neon/dark visual theme with particle effects & projectile trails
- Touch controls for mobile

### 🔮 Phase 2 (Planned)
- Multiplayer via shareable room links (Socket.io)
- Multiple arena layouts
- Power-ups (shield, speed boost, explosive shots)
- Server-side leaderboard
- Sound effects

## License

MIT
