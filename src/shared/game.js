/**
 * game.js — Pure Ultimate Tic-Tac-Toe logic.
 * No DOM, no Node globals. Shared by client and server.
 */

'use strict';

const WIN_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function createGame() {
  return {
    board: Array.from({ length: 9 }, () => ({
      cells: Array(9).fill(null),
      winner: null, // null | 'X' | 'O' | 'draw'
    })),
    turn: 'X',
    nextMini: -1,   // -1 = any board, 0-8 = specific board
    status: 'playing', // 'playing' | 'won' | 'draw'
    winner: null,   // null | 'X' | 'O'
    lastMove: null, // { large, mini } | null
  };
}

function checkWinner(cells) {
  for (const [a, b, c] of WIN_COMBOS) {
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
      return cells[a];
    }
  }
  return null;
}

function isFull(cells) {
  return cells.every((c) => c !== null);
}

/**
 * Apply a move to the game state. Returns { ok, state?, error? }.
 * The caller is responsible for checking turn ownership (online mode).
 */
function applyMove(state, largeIndex, miniIndex) {
  if (state.status !== 'playing') {
    return { ok: false, error: 'Game is over' };
  }

  const mini = state.board[largeIndex];

  // Validate target mini-board
  if (mini.winner) {
    return { ok: false, error: 'That mini-board is already decided' };
  }

  if (state.nextMini !== -1 && state.nextMini !== largeIndex) {
    return { ok: false, error: 'Must play in the highlighted mini-board' };
  }

  // Validate cell is empty
  if (mini.cells[miniIndex] !== null) {
    return { ok: false, error: 'Cell already taken' };
  }

  // Clone state (shallow is fine — we only mutate the specific mini-board)
  const newState = {
    board: state.board.map((b) => ({
      cells: b.cells.slice(),
      winner: b.winner,
    })),
    turn: state.turn,
    nextMini: state.nextMini,
    status: state.status,
    winner: state.winner,
    lastMove: null,
  };

  // Place the mark
  newState.board[largeIndex].cells[miniIndex] = state.turn;

  // Check mini-board winner
  const miniWinner = checkWinner(newState.board[largeIndex].cells);
  if (miniWinner) {
    newState.board[largeIndex].winner = miniWinner;
  } else if (isFull(newState.board[largeIndex].cells)) {
    newState.board[largeIndex].winner = 'draw';
  }

  // Check large-board winner
  const largeWinner = checkWinner(newState.board.map((b) => b.winner));
  if (largeWinner) {
    newState.status = 'won';
    newState.winner = largeWinner;
    newState.turn = largeWinner === 'X' ? 'O' : 'X';
    newState.lastMove = { large: largeIndex, mini: miniIndex };
    return { ok: true, state: newState };
  }

  // Check large-board draw (all mini-boards decided, no winner)
  if (newState.board.every((b) => b.winner !== null)) {
    newState.status = 'draw';
    newState.winner = null;
    newState.turn = state.turn;
    newState.lastMove = { large: largeIndex, mini: miniIndex };
    return { ok: true, state: newState };
  }

  // Compute next mini-board
  const targetBoard = newState.board[miniIndex];
  if (targetBoard.winner) {
    // Target board is decided → free choice
    newState.nextMini = -1;
  } else {
    newState.nextMini = miniIndex;
  }

  // Switch turn
  newState.turn = state.turn === 'X' ? 'O' : 'X';
  newState.lastMove = { large: largeIndex, mini: miniIndex };

  return { ok: true, state: newState };
}

/**
 * Returns which mini-board indices the current player may legally play in.
 */
function legalMiniboards(state) {
  if (state.status !== 'playing') return [];

  if (state.nextMini === -1) {
    // Free choice — any non-won mini-board
    return state.board
      .map((b, i) => (!b.winner ? i : -1))
      .filter((i) => i !== -1);
  }

  return [state.nextMini];
}

// ---------- CommonJS (Node) / ES module (browser) ----------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createGame, applyMove, legalMiniboards };
} else {
  window.TicTacPinky = { createGame, applyMove, legalMiniboards };
}
