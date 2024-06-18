const largeBoardElement = document.getElementById('large-board');
let turn = 'X';
const BBoard = Array(9).fill(null).map(() => ({ cells: Array(9).fill(null), winner: null })); // 9 mini-boards, each with 9 cells and winner status
let nextMoveInLargeCell = -1; // -1 means the player can choose any cell in the large board

// Winning combinations for mini boards
const miniBoardWins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6] 

function checkMiniBoardWinner(cells) {
    for (let combo of miniBoardWins) {
        const [a, b, c] = combo;
        if (cells[a] !== null && cells[a] === cells[b] && cells[a] === cells[c]) {
            return cells[a];
        }
    }
    return null;
}

function checkLargeBoardWinner() {
    // Check horizontal and vertical wins across large board
    for (let i = 0; i < 3; i++) {
        // Horizontal win
        if (BBoard[i * 3].winner && BBoard[i * 3].winner === BBoard[i * 3 + 1].winner && BBoard[i * 3].winner === BBoard[i * 3 + 2].winner) {
            return BBoard[i * 3].winner;
        }
        // Vertical win
        if (BBoard[i].winner && BBoard[i].winner === BBoard[i + 3].winner && BBoard[i].winner === BBoard[i + 6].winner) {
            return BBoard[i].winner;
        }
    }

    // Check diagonal wins
    if (BBoard[0].winner && BBoard[0].winner === BBoard[4].winner && BBoard[0].winner === BBoard[8].winner) {
        return BBoard[0].winner;
    }
    if (BBoard[2].winner && BBoard[2].winner === BBoard[4].winner && BBoard[2].winner === BBoard[6].winner) {
        return BBoard[2].winner;
    }

    // No winner
    return null;
}

function handleMiniCellClick(largeIndex, miniIndex) {
    if (BBoard[largeIndex].cells[miniIndex] === null && BBoard[largeIndex].winner === null) {
        BBoard[largeIndex].cells[miniIndex] = turn;

        // Check if there's a winner in the mini-board
        const winner = checkMiniBoardWinner(BBoard[largeIndex].cells);
        if (winner) {
            BBoard[largeIndex].winner = winner;
        }

        // Check if the entire large board has a winner
        const largeBoardWinner = checkLargeBoardWinner();
        if (largeBoardWinner) {
            // Handle game end
            turn = largeBoardWinner === 'X' ? 'O' : 'X';
            renderLargeBoard();
            alert(`Player ${largeBoardWinner} wins the game!`);
            return;
        }

        // Update turn and next move
        turn = turn === 'X' ? 'O' : 'X';
        nextMoveInLargeCell = BBoard[miniIndex].winner ? -1 : miniIndex;

        renderLargeBoard();
    }
}

function handleLargeCellClick(largeIndex) {
    if (nextMoveInLargeCell === -1 || nextMoveInLargeCell === largeIndex) {
        // Open the mini-board for the player to choose a cell
        renderMiniBoard(largeIndex);
    } else {
        alert(`You must play in cell ${nextMoveInLargeCell + 1} of the large board.`);
    }
}

function renderMiniBoard(largeIndex) {
    const miniBoard = BBoard[largeIndex];
    const miniBoardElement = document.createElement('div');
    miniBoardElement.className = 'mini-board';
    miniBoard.cells.forEach((cell, miniIndex) => {
        const cellElement = document.createElement('div');
        cellElement.className = 'mini-cell';
        cellElement.innerText = cell;
        cellElement.addEventListener('click', () => handleMiniCellClick(largeIndex, miniIndex));
        miniBoardElement.appendChild(cellElement);
    });
    const largeCell = largeBoardElement.children[largeIndex];
    largeCell.innerHTML = '';
    largeCell.appendChild(miniBoardElement);

    // If the large board is won, update its appearance
    if (miniBoard.winner) {
        largeCell.innerText = miniBoard.winner;
        largeCell.classList.add('cell-winner');
    }
}

function renderLargeBoard() {
    largeBoardElement.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const largeCellElement = document.createElement('div');
        largeCellElement.className = 'cell';

        // Highlight the allowed cell and dim the others
        if (nextMoveInLargeCell === -1 || nextMoveInLargeCell === i) {
            largeCellElement.classList.add('highlight');
            largeCellElement.addEventListener('click', () => handleLargeCellClick(i));
        } else {
            largeCellElement.classList.add('dimmed');
        }

        // Render the mini board within each large cell
        const miniBoardElement = document.createElement('div');
        miniBoardElement.className = 'mini-board';
        const miniBoard = BBoard[i];
        miniBoard.cells.forEach((cell, miniIndex) => {
            const cellElement = document.createElement('div');
            cellElement.className = 'mini-cell';
            cellElement.innerText = cell;
            miniBoardElement.appendChild(cellElement);
        });
        largeCellElement.appendChild(miniBoardElement);

        largeBoardElement.appendChild(largeCellElement);

        // If the large board is won, update its appearance
        if (miniBoard.winner) {
            largeCellElement.innerText = miniBoard.winner;
            largeCellElement.classList.add('cell-winner');
        }
    }
}

renderLargeBoard();
