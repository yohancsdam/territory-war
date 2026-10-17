# Territory War

A turn-based stickman battle game for the browser, with destructible terrain. Two teams of six
soldiers take turns: each turn one soldier moves and fires one shot. The last team standing wins.
Play on one device with a friend, or online with a room code.

**Play it:** https://YOUR-GITHUB-USER.github.io/territory-war/ <!-- replace with your GitHub username -->

## Run it locally

You need [Node.js](https://nodejs.org/) 20.19 or newer.

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # rule tests (Vitest)
npm run build      # production build into dist/
npm run preview    # serve dist/ at http://localhost:4173/territory-war/
```

## How to play

- **Local two-player:** both players share the keyboard/mouse (or a touch screen) and take turns.
- **Create online room:** you get a 6-character code. Send it to a friend, pick the map and team
  names, and press *Start battle* once they've joined. The host always plays red.
- **Join a room:** type the code you were given. You play blue; the host chooses the settings.

Rules:

- Red goes first. Each turn one soldier plays, then the other team. Soldiers take turns in order,
  and dead ones are skipped.
- One shot per turn, and 60 seconds to take it. If the timer runs out, the turn is lost.
- Soldiers die when their health runs out or when they're knocked off the map (sides or bottom).
  Falling doesn't hurt.
- Friendly fire is on. There is no wind.
- Maps: hills, floating islands or canyon (or random). Each battle rolls a new layout.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | A / D or ← / → | ◀ ▶ buttons |
| Jump | W | Jump |
| Aim | Mouse, or ↑ / ↓ | Drag on the battlefield, or Aim ▲ / ▼ |
| Switch weapon | 1–6, or the weapon buttons | Weapon buttons |
| Fire | Click or Space | Fire |
| Charge (bazooka, grenade, dynamite) | Hold click or Space, release to launch | Hold Fire |
| Cancel charge | Esc or right click | — |
| Skip turn | — | Skip |

## Tuning

Every gameplay number lives in [`src/config.js`](src/config.js): weapon damage, explosion radius,
knockback, ammo, projectile speeds, turn time, walking and jumping speed, and so on.

## Online play notes

Online play uses WebRTC through the free public [PeerJS](https://peerjs.com/) broker, so there's
no server to run. The host's browser runs the game and streams it to the guest. If either player
closes the tab, the match ends; there's no reconnection. Some strict networks (certain corporate
or mobile networks) block direct WebRTC connections between browsers.

## Publishing to GitHub Pages

1. Create a GitHub repository named `territory-war` and push this project to its `main` branch.
2. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci`, `npm test`,
   `npm run build`, then publishes `dist/`.

If you name the repository differently, change `REPO` in `vite.config.js`.
