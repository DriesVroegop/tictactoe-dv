const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let gameState = {
  board: ['', '', '', '', '', '', '', '', ''],
  currentPlayer: 'X',
  winner: null
};

io.on('connection', (socket) => {
  console.log('Un joueur connecté');
  socket.emit('gameState', gameState);

  socket.on('play', (index) => {
    if (gameState.board[index] === '' && !gameState.winner) {
      gameState.board[index] = gameState.currentPlayer;
      gameState.winner = checkWinner(gameState.board);
      gameState.currentPlayer = gameState.currentPlayer === 'X' ? 'O' : 'X';
      io.emit('gameState', gameState);
    }
  });

  socket.on('restart', () => {
    gameState = {
      board: ['', '', '', '', '', '', '', '', ''],
      currentPlayer: 'X',
      winner: null
    };
    io.emit('gameState', gameState);
  });
});

function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (let [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  if (board.every(cell => cell !== '')) return 'draw';
  return null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});