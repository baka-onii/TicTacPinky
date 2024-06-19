const largeBoardElement = document.getElementById('large-board');
let turn = 'X';
const BBoard = Array(9).fill(null).map(() => ({ cells: Array(9).fill(null), winner: null }));
let nextMoveInLargeCell = -1;

const miniBoardWins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], 
    [0, 3, 6], [1, 4, 7], [2, 5, 8], 
    [0, 4, 8], [2, 4, 6] 
];

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
    for (let i = 0; i < 3; i++) {
        if (BBoard[i * 3].winner && BBoard[i * 3].winner === BBoard[i * 3 + 1].winner && BBoard[i * 3].winner === BBoard[i * 3 + 2].winner) {
            return BBoard[i * 3].winner;
        }
        if (BBoard[i].winner && BBoard[i].winner === BBoard[i + 3].winner && BBoard[i].winner === BBoard[i + 6].winner) {
            return BBoard[i].winner;
        }
    }
    if (BBoard[0].winner && BBoard[0].winner === BBoard[4].winner && BBoard[0].winner === BBoard[8].winner) {
        return BBoard[0].winner;
    }
    if (BBoard[2].winner && BBoard[2].winner === BBoard[4].winner && BBoard[2].winner === BBoard[6].winner) {
        return BBoard[2].winner;
    }
    return null;
}

function handleMiniCellClick(largeIndex, miniIndex) {
    if (BBoard[largeIndex].cells[miniIndex] === null && BBoard[largeIndex].winner === null) {
        BBoard[largeIndex].cells[miniIndex] = turn;

        const winner = checkMiniBoardWinner(BBoard[largeIndex].cells);
        if (winner) {
            BBoard[largeIndex].winner = winner;
        }

        const largeBoardWinner = checkLargeBoardWinner();
        if (largeBoardWinner) {
            turn = largeBoardWinner === 'X' ? 'O' : 'X';
            renderLargeBoard();
            alert(`Player ${largeBoardWinner} wins the game!`);
            return;
        }

        turn = turn === 'X' ? 'O' : 'X';
        nextMoveInLargeCell = BBoard[miniIndex].winner ? -1 : miniIndex;

        renderLargeBoard();
    }
}

function handleLargeCellClick(largeIndex) {
    if (nextMoveInLargeCell === -1 || nextMoveInLargeCell === largeIndex) {
        renderMiniBoard(largeIndex);
    } else {
        // alert(`You must play in cell ${nextMoveInLargeCell + 1} of the large board.`);
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

        if (nextMoveInLargeCell === -1 || nextMoveInLargeCell === i) {
            largeCellElement.classList.add('highlight');
            largeCellElement.addEventListener('click', () => handleLargeCellClick(i));
        } else {
            largeCellElement.classList.add('dimmed');
        }

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

        if (miniBoard.winner) {
            largeCellElement.innerText = miniBoard.winner;
            largeCellElement.classList.add('cell-winner');
            alert("Game Ended");
        }
    }
}

renderLargeBoard();
