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

function getRole(match, socketId) {
  if (match.players.X === socketId) return 'X';
  if (match.players.O === socketId) return 'O';
  return 'spectator';
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
  // Emit to both players and all spectators
  const recipientIds = [];
  if (match.players.X) recipientIds.push(match.players.X);
  if (match.players.O) recipientIds.push(match.players.O);
  for (const sid of match.spectators) recipientIds.push(sid);

  for (const sid of recipientIds) {
    io.to(sid).emit('match:state', { ...payload, role: getRole(match, sid) });
  }
}

function createMatch(id, playerName) {
  const match = {
    id,
    state: createGame(),
    players: { X: null, O: null },
    names: { X: playerName, O: null },
    spectators: new Set(),
    rematchVotes: new Set(),
    chat: [],
  };
  matches.set(id, match);
  return match;
}

// ---- Socket.IO handlers ----
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('match:create', ({ name }) => {
    const id = generateId();
    // Ensure uniqueness (extremely unlikely collision with 30 chars, but safe)
    while (matches.has(id)) id = generateId();

    const match = createMatch(id, name);
    match.players.X = socket.id;

    // Bind this socket to the match
    socket.join(id);
    socket.data.matchId = id;

    socket.emit('match:created', {
      id,
      role: 'X',
      shareUrl: `/match/${id}`,
    });
    broadcastMatch(io, match);
    console.log(`[create] ${id} by "${name}" (${socket.id})`);
  });

  socket.on('match:join', ({ id, name }) => {
    const match = matches.get(id);
    if (!match) {
      socket.emit('match:error', { error: 'Match not found' });
      return;
    }

    // If the socket was already in this match as a spectator, leave spectator set
    match.spectators.delete(socket.id);

    let role = 'spectator';
    if (!match.players.O) {
      match.players.O = socket.id;
      match.names.O = name;
      role = 'O';
    } else if (match.players.O === socket.id) {
      role = 'O';
    } else if (match.players.X === socket.id) {
      role = 'X';
    } else {
      match.spectators.add(socket.id);
    }

    socket.join(id);
    socket.data.matchId = id;
    socket.data.playerName = name;

    socket.emit('match:joined', {
      id,
      role,
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

    const role = getRole(match, socket.id);
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
    // Clear rematch votes on any new move
    match.rematchVotes.clear();
    broadcastMatch(io, match);
  });

  socket.on('rematch:vote', ({ id }) => {
    const match = matches.get(id);
    if (!match) return;

    const role = getRole(match, socket.id);
    if (role === 'spectator') return;

    match.rematchVotes.add(role);

    // Notify all about who voted
    const recipientIds = [
      match.players.X,
      match.players.O,
      ...match.spectators,
    ].filter(Boolean);
    for (const sid of recipientIds) {
      io.to(sid).emit('rematch:update', { votes: [...match.rematchVotes] });
    }

    // If both players voted, reset the game
    if (match.rematchVotes.has('X') && match.rematchVotes.has('O')) {
      const prevChat = match.chat;
      match.state = createGame();
      match.rematchVotes.clear();
      match.chat = prevChat; // keep chat history
      broadcastMatch(io, match);
      console.log(`[rematch] ${id} reset`);
    }
  });

  socket.on('chat:message', ({ id, text }) => {
    const match = matches.get(id);
    if (!match) return;

    const role = getRole(match, socket.id);
    const name = socket.data.playerName || (match.names.X === socket.id ? match.names.X : match.names.O) || 'Spectator';

    const msg = { from: role, name, role, text, ts: Date.now() };
    match.chat.push(msg);
    // Cap chat history
    if (match.chat.length > 200) match.chat = match.chat.slice(-100);

    const recipientIds = [
      match.players.X,
      match.players.O,
      ...match.spectators,
    ].filter(Boolean);
    for (const sid of recipientIds) {
      io.to(sid).emit('chat:message', msg);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    const matchId = socket.data.matchId;
    if (!matchId) return;

    const match = matches.get(matchId);
    if (!match) return;

    // Remove from match
    if (match.players.X === socket.id) {
      match.players.X = null;
    }
    if (match.players.O === socket.id) {
      match.players.O = null;
    }
    match.spectators.delete(socket.id);
    match.rematchVotes.clear();

    // Notify remaining participants
    const recipientIds = [
      match.players.X,
      match.players.O,
      ...match.spectators,
    ].filter(Boolean);
    for (const sid of recipientIds) {
      io.to(sid).emit('match:peer-left', {
        role: 'unknown',
        players: match.names,
        state: match.state,
      });
    }

    // Clean up empty matches after a delay
    setTimeout(() => {
      const m = matches.get(matchId);
      if (m && !m.players.X && !m.players.O && m.spectators.size === 0) {
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
