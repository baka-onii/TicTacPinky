const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createGame, applyMove } = require('./src/shared/game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  // Trust the reverse proxy so Socket.IO can detect the correct protocol
});

// Render and similar PaaS hosts terminate SSL at the load balancer.
// This tells Express to trust X-Forwarded-* headers from the proxy.
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// ---- Static files ----
app.use(express.static(path.join(__dirname, 'src', 'client')));
// Serve shared game.js so the browser loads the same logic the server uses
app.use('/shared', express.static(path.join(__dirname, 'src', 'shared')));

// Health check — Render pings this to confirm the service is alive
app.get('/health', (req, res) => res.json({ ok: true }));

// SPA fallback: any non-asset route serves index.html (so /?match=XXX works)
app.get('*', (req, res) => {
  // Only fall back if it doesn't look like a file request
  if (!req.path.includes('.')) {
    res.sendFile(path.join(__dirname, 'src', 'client', 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

// ---- In-memory match store ----
const matches = new Map(); // matchId -> match object

function generateId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 to avoid ambiguity
  let id = '';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function getRole(match, sessionToken) {
  if (sessionToken && match.players.X === sessionToken) return 'X';
  if (sessionToken && match.players.O === sessionToken) return 'O';
  return 'spectator';
}

// Recipients = every live socket currently attached to this match
function recipientSocketIds(match) {
  const ids = [];
  if (match.sockets.X) ids.push(match.sockets.X);
  if (match.sockets.O) ids.push(match.sockets.O);
  for (const sid of match.spectators.values()) ids.push(sid);
  return ids;
}

function broadcastMatch(io, match) {
  const payload = {
    id: match.id,
    state: match.state,
    players: {
      X: match.names.X,
      O: match.names.O,
    },
    chat: match.chat,
  };
  for (const sid of recipientSocketIds(match)) {
    // Look up this socket's session token to send the correct role
    const socket = io.sockets.sockets.get(sid);
    const token = socket && socket.data ? socket.data.sessionToken : null;
    io.to(sid).emit('match:state', { ...payload, role: getRole(match, token) });
  }
}

function createMatch(id, playerName, sessionToken) {
  const match = {
    id,
    state: createGame(),
    // Track players by stable session token (survives reconnects/refreshes)
    players: { X: sessionToken, O: null },
    sockets: { X: null, O: null },    // current live socket id per role
    names: { X: playerName, O: null },
    spectators: new Map(),             // sessionToken -> socketId
    rematchVotes: new Set(),
    chat: [],
  };
  matches.set(id, match);
  return match;
}

// Generate a random session token (client-supplied; we just check uniqueness within a match)
function generateToken() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---- Socket.IO handlers ----
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('match:create', ({ name, token }) => {
    const sessionToken = token || generateToken();
    const id = generateId();
    while (matches.has(id)) id = generateId();

    const match = createMatch(id, name, sessionToken);
    match.sockets.X = socket.id;

    socket.join(id);
    socket.data.matchId = id;
    socket.data.sessionToken = sessionToken;
    socket.data.playerName = name;

    socket.emit('match:created', {
      id,
      role: 'X',
      sessionToken, // client stores it in localStorage
      shareUrl: `/match/${id}`,
    });
    broadcastMatch(io, match);
    console.log(`[create] ${id} by "${name}" (${socket.id})`);
  });

  socket.on('match:join', ({ id, name, token }) => {
    const match = matches.get(id);
    if (!match) {
      socket.emit('match:error', { error: 'Match not found' });
      return;
    }

    const sessionToken = token || generateToken();
    socket.data.sessionToken = sessionToken;

    let role;
    // Reclaim an existing role if this token already owns one
    if (match.players.X === sessionToken) {
      role = 'X';
      match.sockets.X = socket.id;
      if (name) match.names.X = name;
    } else if (match.players.O === sessionToken) {
      role = 'O';
      match.sockets.O = socket.id;
      if (name) match.names.O = name;
    } else if (match.players.O === null) {
      // O slot is open → take it
      role = 'O';
      match.players.O = sessionToken;
      match.sockets.O = socket.id;
      match.names.O = name;
    } else {
      // Both slots taken by other tokens → spectator
      role = 'spectator';
      // Drop any prior spectator entry for this token, then re-add
      match.spectators.delete(sessionToken);
      match.spectators.set(sessionToken, socket.id);
    }

    socket.join(id);
    socket.data.matchId = id;
    socket.data.playerName = name;

    socket.emit('match:joined', {
      id,
      role,
      sessionToken,
      state: match.state,
      players: match.names,
      chat: match.chat,
    });
    broadcastMatch(io, match);
    console.log(`[join] ${id} "${name}" as ${role} (${socket.id})`);
  });

  socket.on('move', ({ id, large, mini }) => {
    const match = matches.get(id);
    if (!match) return;

    const role = getRole(match, socket.data.sessionToken);
    if (role === 'spectator') return;
    if (role !== match.state.turn) {
      socket.emit('match:error', { error: 'Not your turn' });
      return;
    }

    const result = applyMove(match.state, large, mini);
    if (!result.ok) {
      socket.emit('match:error', { error: result.error });
      return;
    }

    match.state = result.state;
    match.rematchVotes.clear();
    broadcastMatch(io, match);
  });

  socket.on('rematch:vote', ({ id }) => {
    const match = matches.get(id);
    if (!match) return;

    const role = getRole(match, socket.data.sessionToken);
    if (role === 'spectator') return;

    match.rematchVotes.add(role);

    for (const sid of recipientSocketIds(match)) {
      io.to(sid).emit('rematch:update', { votes: [...match.rematchVotes] });
    }

    if (match.rematchVotes.has('X') && match.rematchVotes.has('O')) {
      const prevChat = match.chat;
      match.state = createGame();
      match.rematchVotes.clear();
      match.chat = prevChat;
      broadcastMatch(io, match);
      console.log(`[rematch] ${id} reset`);
    }
  });

  socket.on('chat:message', ({ id, text }) => {
    const match = matches.get(id);
    if (!match) return;

    const role = getRole(match, socket.data.sessionToken);
    const name = socket.data.playerName || match.names[role] || 'Spectator';

    const msg = { from: role, name, role, text, ts: Date.now() };
    match.chat.push(msg);
    if (match.chat.length > 200) match.chat = match.chat.slice(-100);

    for (const sid of recipientSocketIds(match)) {
      io.to(sid).emit('chat:message', msg);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    const matchId = socket.data.matchId;
    if (!matchId) return;

    const match = matches.get(matchId);
    if (!match) return;

    // Clear only the live socket pointer — KEEP the session token so the player
    // can reclaim their seat on reconnect. Only notify others they went offline.
    if (match.sockets.X === socket.id) match.sockets.X = null;
    if (match.sockets.O === socket.id) match.sockets.O = null;
    // For spectators, remove by value
    for (const [tok, sid] of match.spectators) {
      if (sid === socket.id) { match.spectators.delete(tok); break; }
    }
    match.rematchVotes.clear();

    for (const sid of recipientSocketIds(match)) {
      io.to(sid).emit('match:peer-left', {
        players: match.names,
        state: match.state,
      });
    }

    // Clean up matches with NO live sockets and no reclaimable seat tokens.
    // We keep the match around if at least one seat token exists, so a brief
    // disconnect doesn't wipe the match.
    setTimeout(() => {
      const m = matches.get(matchId);
      if (!m) return;
      const noLiveSockets = !m.sockets.X && !m.sockets.O && m.spectators.size === 0;
      if (noLiveSockets) {
        matches.delete(matchId);
        console.log(`[cleanup] match ${matchId} removed`);
      }
    }, 60_000);
  });
});

// ---- Start ----
server.listen(PORT, () => {
  console.log(`TicTacPinky server running on http://localhost:${PORT}`);
});
