# Tic Tac Pinky

A reimagined **Ultimate Tic-Tac-Toe** — a 3×3 grid where each cell is itself a 3×3 mini-board, and the cell you pick sends your opponent to the mini-board in the matching position. More strategic and far harder than regular Tic-Tac-Toe.

Now with a modern black-minimal UI, **online multiplayer via shareable links**, plus a local hot-seat mode.

---

## How to play

- The board is a 3×3 grid of mini-boards, each itself a 3×3 grid (81 cells total).
- Players take turns. X goes first.
- The cell you pick **sends your opponent** to the mini-board in the corresponding position.
  - e.g. play the top-right cell of any mini-board → your opponent must play in the top-right mini-board next.
- Win a mini-board (3-in-a-row) to claim that cell of the **large board**.
- If a mini-board is full or already won, it counts as decided — a draw shows as `=`.
- If your move would send your opponent to a decided mini-board, they get **free choice** of any open mini-board.
- Win three mini-boards in a row (horizontal, vertical, or diagonal) on the large board to win the game.

---

## Run locally

Requirements: [Node.js](https://nodejs.org/) 18+.

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

For live reload during development:

```bash
npm run dev
```

The port defaults to `3000`. Override it with the `PORT` environment variable:

```bash
# Linux / macOS
PORT=8080 npm start
# Windows (Git Bash / cmd)
PORT=8080 npm start
```

---

## Playing with friends over the internet

The flow: run the server on your machine, **port-forward** a TCP port from your router to your machine, then send friends your **public IP + port + match code**.

### 1. Find your LAN IP

```bash
# Windows (Git Bash)
ipconfig | grep -A 4 "Wireless\|Ethernet"
# Look for "IPv4 Address", e.g. 192.168.1.42
```

### 2. Port-forward on your router

- Log into your router's admin page (commonly `http://192.168.1.1` or `http://192.168.0.1`).
- Find **Port Forwarding** / **Virtual Server** / **NAT** settings.
- Forward **TCP** port `3000` (or whatever `PORT` you chose) to your LAN IP from step 1.
- Some routers call this "Single Port Forwarding" — that's fine.

### 3. Allow inbound on Windows Defender Firewall

Open **PowerShell as Administrator** and run:

```powershell
New-NetFirewallRule -DisplayName "TicTacPinky" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

(Adjust `-LocalPort` if you picked a different `PORT`.)

### 4. Find your public IP

```bash
curl ifconfig.io
# or visit https://ifconfig.io in a browser
```

### 5. Share the link

In the app: **Online match → Create match**. The lobby shows a link like:

```
http://PUBLIC_IP:3000/?match=K7Q2
```

Send that whole URL to your friend. They open it, enter a name, and join as **O**. Anyone else opening the link joins as a **spectator** (read-only).

### Troubleshooting

- **Friends can't connect:**
  - Double-check the port-forward rule points to the right LAN IP.
  - Verify Windows Firewall allows the port.
  - Restart the server after changing network settings.
- **Your ISP uses CGNAT** (common with mobile hotspots and some home ISPs) — your "public" IP is shared and inbound connections won't work. Two easy fallbacks:
  - [**Tailscale**](https://tailscale.com/) — zero-config mesh VPN. Install on your machine and your friend's, share your Tailscale IP, done. No port-forwarding needed.
  - [**ngrok**](https://ngrok.com/) — `ngrok http 3000` gives you a public HTTPS URL instantly.
- **WebSocket connection drops** — Socket.IO auto-reconnects; if your network is very flaky, the client resyncs the match state on reconnect.

> ⚠️ **Security note:** the server has no authentication. Anyone with your link can join. That's fine for playing with friends, but don't leave it running exposed to the whole internet. For a permanent setup, put it behind a reverse proxy (e.g. Caddy/Nginx) with TLS and consider a password.

---

## Modes

- **Local 2-player** — pass-and-play on one device. No server required; works even as a static site.
- **Online match** — host or join a match via a 4-character code. Features:
  - **Player names** — each player names themselves; shown on the board and turn indicator.
  - **Rematch** — either player can offer a rematch after a game; both accept and a new game starts with the same players and chat history.
  - **Spectator mode** — a 3rd+ person opening the link watches the match live (read-only).
  - **In-game chat** — sidebar chat for players and spectators.

---

## Project structure

```
TicTacPinky/
├── package.json
├── server.js                # Express + Socket.IO server (entry)
├── src/
│   ├── shared/
│   │   └── game.js          # Pure game logic — shared by client and server
│   ├── server/              # (reserved for future server modules)
│   └── client/
│       ├── index.html       # App shell (menu, lobby, game views)
│       ├── styles.css       # Black-minimal modern theme
│       ├── app.js           # View router + UI glue
│       ├── board.js         # Board renderer (shared by offline + online)
│       ├── offline.js       # Local hot-seat mode
│       └── online.js        # Socket.IO client
└── README.md
```

The game logic lives once in `src/shared/game.js` and is loaded by **both** the server (for authoritative move validation) and the browser (for offline play and optimistic UI). No logic is duplicated.

---

## Development notes

- **State is in-memory only.** Matches vanish when the server restarts. Fine for friends-only; if you want persistence, swap the `matches` Map in `server.js` for a database.
- **No HTTPS.** For localhost or a trusted LAN that's acceptable; for internet-exposed hosting use a reverse proxy with TLS.
- **No accounts.** Names are entered per-match and stored only in `localStorage` for convenience.
