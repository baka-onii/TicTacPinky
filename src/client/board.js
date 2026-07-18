/**
 * board.js — renders the Ultimate Tic-Tac-Toe board from shared game state.
 * Exposes window.Board.render(state, options) and window.Board.bind(container, onCellClick).
 */
(function () {
  'use strict';

  const { legalMiniboards } = window.TicTacPinky;

  const Board = {
    /**
     * Render the board into #large-board based on game state.
     * @param {object} state  - game state from shared/game.js
     * @param {object} opts
     *   - interactive: bool (whether clicks are allowed)
     *   - myTurn: bool (highlight clickable cells)
     *   - onCellClick: (largeIndex, miniIndex) => void
     */
    render(state, opts = {}) {
      const { interactive = true, myTurn = true, onCellClick = null } = opts;
      const root = document.getElementById('large-board');
      root.innerHTML = '';

      const legal = legalMiniboards(state);
      const legalSet = new Set(legal);

      for (let largeIndex = 0; largeIndex < 9; largeIndex++) {
        const miniBoard = state.board[largeIndex];
        const miniEl = document.createElement('div');
        miniEl.className = 'mini-board';
        miniEl.dataset.largeIndex = largeIndex;

        const isWon = !!miniBoard.winner && miniBoard.winner !== 'draw';
        const isDrawn = miniBoard.winner === 'draw';
        const isDecided = !!miniBoard.winner;
        const isActive = legalSet.has(largeIndex) && interactive && myTurn;

        if (isActive) miniEl.classList.add('active');
        if (interactive && !myTurn) miniEl.classList.add('read-only');

        if (isDecided) {
          miniEl.classList.add('won');
          miniEl.dataset.winner = miniBoard.winner;
        } else if (!isActive && interactive) {
          // Dim only when there IS a constraint (nextMini !== -1) and this isn't it
          if (state.nextMini !== -1) miniEl.classList.add('dimmed');
        }

        // Render the 9 mini-cells (hidden via CSS when board is won)
        for (let miniIndex = 0; miniIndex < 9; miniIndex++) {
          const cellValue = miniBoard.cells[miniIndex];
          const cellEl = document.createElement('div');
          cellEl.className = 'mini-cell';
          cellEl.dataset.largeIndex = largeIndex;
          cellEl.dataset.miniIndex = miniIndex;

          if (cellValue) {
            cellEl.classList.add('filled', cellValue.toLowerCase());
            cellEl.textContent = cellValue;
          }

          // Highlight last move
          if (
            state.lastMove &&
            state.lastMove.large === largeIndex &&
            state.lastMove.mini === miniIndex
          ) {
            cellEl.classList.add('last-move');
          }

          // Click handler — only for non-decided, non-filled cells, when interactive & my turn
          if (interactive && myTurn && !isDecided && !cellValue && onCellClick) {
            cellEl.addEventListener('click', () => {
              onCellClick(largeIndex, miniIndex);
            });
          }

          miniEl.appendChild(cellEl);
        }

        // Draw indicator for decided-but-drawn mini-boards
        if (isDrawn) {
          // CSS handles the "=" via data-winner="draw"
        }

        root.appendChild(miniEl);
      }
    },
  };

  window.Board = Board;
})();
