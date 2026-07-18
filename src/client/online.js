/**
 * online.js — Socket.IO client for online mode.
 * Exposes window.OnlineMode with create()/join()/start() helpers and event wiring.
 */
(function () {
  'use strict';

  const Board = window.Board;

  let socket = null;
  let match = null;     // current client-side view of the match
  let myRole = null;    // 'X' | 'O' | 'spectator'
  let myName = '';
  let matchId = null;
  let chatBound = false;
  let rematchBound = false;
  let hadFirstState = false;

  function connect() {
    if (socket && socket.connected) return socket;
    socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[socket] connected', socket.id);
      // If we already know our match (e.g. reconnecting), rejoin silently
      if (matchId && myName) {
        socket.emit('match:join', { id: matchId, name: myName });
      }
    });

    socket.on('disconnect', () => {
      console.log('[socket] disconnected');
      window.App.toast('Connection lost — reconnecting…', 'error');
    });

    socket.on('connect_error', (err) => {
      console.warn('[socket] connect_error', err.message);
    });

    socket.on('match:created', (payload) => {
      matchId = payload.id;
      myRole = payload.role;
      window.App.onMatchCreated(payload);
    });

    socket.on('match:joined', (payload) => {
      matchId = payload.id;
      myRole = payload.role;
      match = {
        id: payload.id,
        state: payload.state,
        names: payload.players,
        chat: payload.chat || [],
      };
      hadFirstState = true;
      window.App.onMatchJoined(payload);
    });

    socket.on('match:state', (payload) => {
      match = {
        id: payload.id,
        state: payload.state,
        names: payload.players,
        chat: payload.chat || [],
      };
      myRole = payload.role || myRole;
      renderGame();
    });

    socket.on('match:error', ({ error }) => {
      window.App.toast(error, 'error');
    });

    socket.on('chat:message', (msg) => {
      if (!match) return;
      match.chat.push(msg);
      appendChatMessage(msg);
      scrollChatToBottom();
    });

    socket.on('rematch:update', ({ votes }) => {
      const set = new Set(votes);
      const mine = set.has(myRole);
      const rematchBtn = document.getElementById('rematch-btn');
      if (mine) {
        rematchBtn.textContent = 'Waiting for opponent…';
        rematchBtn.disabled = true;
      } else {
        rematchBtn.textContent = 'Accept rematch';
        rematchBtn.disabled = false;
      }
      if (set.has('X') && set.has('O')) {
        window.App.toast('Rematch starting…', 'success');
      }
    });

    socket.on('match:peer-left', () => {
      window.App.toast('Opponent disconnected. Match state preserved.', 'error');
    });

    return socket;
  }

  function create(name) {
    myName = name;
    connect();
    socket.emit('match:create', { name });
  }

  function join(id, name) {
    matchId = id.toUpperCase();
    myName = name;
    connect();
    socket.emit('match:join', { id: matchId, name });
  }

  function handleCellClick(largeIndex, miniIndex) {
    if (!match) return;
    if (myRole === 'spectator') return;
    if (match.state.turn !== myRole) {
      window.App.toast("Not your turn", 'error');
      return;
    }
    socket.emit('move', { id: matchId, large: largeIndex, mini: miniIndex });
  }

  function sendChat(text) {
    if (!text.trim() || !matchId) return;
    socket.emit('chat:message', { id: matchId, text: text.trim() });
  }

  function voteRematch() {
    if (!matchId) return;
    socket.emit('rematch:vote', { id: matchId });
  }

  function renderGame() {
    if (!match) return;
    const isMyTurn = myRole === match.state.turn && match.state.status === 'playing';
    Board.render(match.state, {
      interactive: true,
      myTurn: myRole === 'spectator' ? false : isMyTurn,
      onCellClick: handleCellClick,
    });
    updateSidebar();
    updateStatus();
    renderChatList();
    bindControls();
  }

  // Re-render the board; for spectators we still want it interactive=false
  function updateSidebar() {
    document.getElementById('match-code-display').textContent = match.id;
    document.getElementById('match-code-sidebar').textContent = match.id;
    document.getElementById('your-role').textContent =
      myRole === 'spectator' ? 'Spectator' : `Player ${myRole}`;

    const xRow = document.getElementById('player-x');
    const oRow = document.getElementById('player-o');
    xRow.classList.toggle('active', match.state.turn === 'X' && match.state.status === 'playing');
    oRow.classList.toggle('active', match.state.turn === 'O' && match.state.status === 'playing');

    document.getElementById('player-x-name').textContent = match.names.X || 'Waiting…';
    document.getElementById('player-o-name').textContent = match.names.O || 'Waiting…';

    const xStatus = document.getElementById('player-x-status');
    const oStatus = document.getElementById('player-o-status');
    xStatus.className = 'player-status' + (myRole === 'X' ? ' you' : '');
    oStatus.className = 'player-status' + (myRole === 'O' ? ' you' : '');
    xStatus.textContent = myRole === 'X' ? 'you' :
      (match.state.status === 'won' && match.state.winner === 'X' ? 'winner' : '');
    oStatus.textContent = myRole === 'O' ? 'you' :
      (match.state.status === 'won' && match.state.winner === 'O' ? 'winner' : '');

    document.querySelector('.chat-card').style.display = '';
    document.getElementById('copy-link-sidebar-btn').style.display = '';
  }

  function updateStatus() {
    const turnInfo = document.getElementById('turn-info');
    const turnText = document.getElementById('turn-text');
    const banner = document.getElementById('game-over-banner');
    const bannerMsg = document.getElementById('game-over-msg');
    const rematchBtn = document.getElementById('rematch-btn');
    const currentMark = turnInfo.querySelector('.turn-mark');

    if (match.state.status === 'playing') {
      banner.classList.remove('show');
      rematchBtn.style.display = 'none';
      rematchBtn.disabled = false;

      if (myRole === 'spectator') {
        const mark = match.state.turn;
        currentMark.textContent = mark;
        currentMark.className = 'turn-mark ' + mark.toLowerCase();
        turnText.textContent = `Spectating — ${mark}'s turn`;
      } else if (match.state.turn === myRole) {
        const mark = myRole;
        currentMark.textContent = mark;
        currentMark.className = 'turn-mark ' + mark.toLowerCase();
        turnText.textContent = 'Your turn';
      } else {
        const mark = match.state.turn === 'X' ? 'O' : 'X';
        currentMark.textContent = mark;
        currentMark.className = 'turn-mark ' + mark.toLowerCase();
        turnText.textContent = `Waiting for ${mark}…`;
      }
    } else {
      currentMark.textContent = '–';
      currentMark.className = 'turn-mark';
      turnText.textContent = 'Game over';
      banner.classList.add('show');
      rematchBtn.style.display = myRole === 'spectator' ? 'none' : 'inline-flex';
      rematchBtn.disabled = false;

      if (match.state.status === 'won') {
        const w = match.state.winner;
        const cls = w.toLowerCase();
        const winnerName = match.names[w] || w;
        if (myRole === w) {
          bannerMsg.innerHTML = `<span class="winner ${cls}">You win!</span>`;
        } else if (myRole === 'spectator') {
          bannerMsg.innerHTML = `<span class="winner ${cls}">${winnerName} (${w})</span> wins!`;
        } else {
          bannerMsg.innerHTML = `<span class="winner ${cls}">${winnerName} (${w})</span> wins. Better luck next time.`;
        }
      } else {
        bannerMsg.textContent = `It's a draw!`;
      }
    }
  }

  function renderChatList() {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    if (!match.chat || match.chat.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'chat-msg system';
      empty.textContent = 'No messages yet.';
      container.appendChild(empty);
      return;
    }
    for (const msg of match.chat) {
      appendChatMessage(msg);
    }
    scrollChatToBottom();
  }

  function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    // Remove the "no messages yet" placeholder
    const placeholder = container.querySelector('.chat-msg.system');
    if (placeholder && placeholder.textContent.includes('No messages')) {
      placeholder.remove();
    }
    const el = document.createElement('div');
    el.className = 'chat-msg';
    const fromClass = msg.role === 'X' ? 'x' : msg.role === 'O' ? 'o' : 'spec';
    const label = msg.role === 'spectator' ? 'Spectator' : (msg.name || msg.role);
    el.innerHTML = `<span class="from ${fromClass}">${escapeHtml(label)}:</span> ${escapeHtml(msg.text)}`;
    container.appendChild(el);
  }

  function scrollChatToBottom() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function bindControls() {
    if (!chatBound) {
      chatBound = true;
      const input = document.getElementById('chat-input');
      const sendBtn = document.getElementById('chat-send-btn');
      const send = () => {
        const text = input.value;
        if (!text.trim()) return;
        sendChat(text);
        input.value = '';
      };
      sendBtn.addEventListener('click', send);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') send();
      });
    }

    if (!rematchBound) {
      rematchBound = true;
      document.getElementById('rematch-btn').addEventListener('click', () => {
        voteRematch();
      });
    }
  }

  const OnlineMode = {
    create,
    join,
    handleCellClick,
    sendChat,
    getMatchId: () => matchId,
    getMyRole: () => myRole,
  };

  window.OnlineMode = OnlineMode;
})();
