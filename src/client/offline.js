/**
 * offline.js — Local hot-seat mode. Uses shared/game.js directly, no socket.
 * Exposes window.OfflineMode.start().
 */
(function () {
  'use strict';

  const { createGame, applyMove } = window.TicTacPinky;
  const Board = window.Board;

  let state = null;
  let names = { X: 'Player 1', O: 'Player 2' };

  function render() {
    Board.render(state, {
      interactive: true,
      myTurn: true,
      onCellClick: handleCellClick,
    });
    updateSidebar();
    updateStatus();
  }

  function handleCellClick(largeIndex, miniIndex) {
    const result = applyMove(state, largeIndex, miniIndex);
    if (!result.ok) {
      window.App.toast(result.error, 'error');
      return;
    }
    state = result.state;
    render();
  }

  function updateStatus() {
    const turnInfo = document.getElementById('turn-info');
    const turnText = document.getElementById('turn-text');
    const banner = document.getElementById('game-over-banner');
    const bannerMsg = document.getElementById('game-over-msg');
    const rematchBtn = document.getElementById('rematch-btn');

    const currentMark = turnInfo.querySelector('.turn-mark');

    if (state.status === 'playing') {
      const mark = state.turn;
      currentMark.textContent = mark;
      currentMark.className = 'turn-mark ' + mark.toLowerCase();
      turnText.textContent = `${names[mark]}'s turn (${mark})`;
      banner.classList.remove('show');
      rematchBtn.style.display = 'none';
    } else if (state.status === 'won') {
      const w = state.winner;
      currentMark.textContent = w;
      currentMark.className = 'turn-mark ' + w.toLowerCase();
      turnText.textContent = 'Game over';
      bannerMsg.innerHTML = `<span class="winner ${w.toLowerCase()}">${names[w]} (${w})</span> wins!`;
      banner.classList.add('show');
      rematchBtn.style.display = 'inline-flex';
      rematchBtn.textContent = 'Play again';
    } else if (state.status === 'draw') {
      currentMark.textContent = '–';
      currentMark.className = 'turn-mark';
      turnText.textContent = 'Game over';
      bannerMsg.textContent = `It's a draw!`;
      banner.classList.add('show');
      rematchBtn.style.display = 'inline-flex';
      rematchBtn.textContent = 'Play again';
    }
  }

  function updateSidebar() {
    document.getElementById('match-code-display').textContent = 'LOCAL';
    document.getElementById('match-code-sidebar').textContent = 'LOCAL';
    document.getElementById('your-role').textContent = 'Hot-seat';
    document.getElementById('copy-link-sidebar-btn').style.display = 'none';

    // Player rows
    const xRow = document.getElementById('player-x');
    const oRow = document.getElementById('player-o');
    xRow.classList.toggle('active', state.turn === 'X' && state.status === 'playing');
    oRow.classList.toggle('active', state.turn === 'O' && state.status === 'playing');

    document.getElementById('player-x-name').textContent = names.X;
    document.getElementById('player-o-name').textContent = names.O;
    document.getElementById('player-x-status').textContent =
      state.status === 'won' && state.winner === 'X' ? 'Winner' : '';
    document.getElementById('player-o-status').textContent =
      state.status === 'won' && state.winner === 'O' ? 'Winner' : '';

    // Names editable inline (only once on start; re-binding is cheap)
    bindEditableName('player-x-name', () => names.X, (v) => { names.X = v; });
    bindEditableName('player-o-name', () => names.O, (v) => { names.O = v; });

    // Chat hidden in offline mode
    document.querySelector('.chat-card').style.display = 'none';
  }

  function bindEditableName(elId, get, set) {
    const el = document.getElementById(elId);
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.style.cursor = 'text';
    el.title = 'Click to rename';
    el.addEventListener('click', () => {
      const current = get();
      const input = prompt('Player name:', current);
      if (input && input.trim()) {
        set(input.trim().slice(0, 20));
        updateSidebar();
        updateStatus();
      }
    });
  }

  function startRematch() {
    state = createGame();
    render();
  }

  const OfflineMode = {
    start() {
      state = createGame();
      names = { X: 'Player 1', O: 'Player 2' };

      // Wire rematch button (only once)
      const rematchBtn = document.getElementById('rematch-btn');
      rematchBtn.onclick = startRematch;

      // Clear chat from any prior online session
      document.getElementById('chat-messages').innerHTML = '';

      render();
    },
  };

  window.OfflineMode = OfflineMode;
})();
