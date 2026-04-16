const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingPlayer = null;
let games = {};

function createGame(player1, player2) {
  const gameId = player1.id + '-' + player2.id;
  games[gameId] = {
    board: ['', '', '', '', '', '', '', '', ''],
    currentPlayer: 'X',
    winner: null,
    players: { X: player1.id, O: player2.id },
    sockets: { X: player1, O: player2 },
    timer: null,
    rematchVotes: {}
  };
  player1.gameId = gameId;
  player2.gameId = gameId;
  player1.symbol = 'X';
  player2.symbol = 'O';

  io.to(player1.id).emit('gameStart', { symbol: 'X', gameId });
  io.to(player2.id).emit('gameStart', { symbol: 'O', gameId });

  setTimeout(() => {
    sendGameState(gameId);
    startTimer(gameId);
  }, 100);
}

function sendGameState(gameId) {
  const game = games[gameId];
  if (!game) return;
  const state = {
    board: game.board,
    currentPlayer: game.currentPlayer,
    winner: game.winner
  };
  io.to(game.players.X).emit('gameState', state);
  io.to(game.players.O).emit('gameState', state);
}

function startTimer(gameId) {
  const game = games[gameId];
  if (!game || game.winner) return;
  if (game.timer) clearInterval(game.timer);

  let timeLeft = 10;
  io.to(game.players.X).emit('timer', timeLeft);
  io.to(game.players.O).emit('timer', timeLeft);

  game.timer = setInterval(() => {
    timeLeft--;
    io.to(game.players.X).emit('timer', timeLeft);
    io.to(game.players.O).emit('timer', timeLeft);
    if (timeLeft <= 0) {
      clearInterval(game.timer);
      playRandom(gameId);
    }
  }, 1000);
}

function playRandom(gameId) {
  const game = games[gameId];
  if (!game || game.winner) return;
  const empty = game.board.map((v, i) => v === '' ? i : null).filter(v => v !== null);
  if (empty.length === 0) return;
  const index = empty[Math.floor(Math.random() * empty.length)];
  makeMove(gameId, index);
}

function makeMove(gameId, index) {
  const game = games[gameId];
  if (!game || game.winner || game.board[index] !== '') return;
  game.board[index] = game.currentPlayer;
  game.winner = checkWinner(game.board);
  game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
  sendGameState(gameId);
  if (game.winner) {
    if (game.timer) clearInterval(game.timer);
  } else {
    startTimer(gameId);
  }
}

function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (let [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every(cell => cell !== '')) return 'draw';
  return null;
}

io.on('connection', (socket) => {
  socket.gameId = null;
  socket.symbol = null;

  socket.on('joinOnline', () => {
    if (waitingPlayer && waitingPlayer.id !== socket.id) {
      createGame(waitingPlayer, socket);
      waitingPlayer = null;
    } else {
      waitingPlayer = socket;
      socket.emit('waiting');
    }
  });

  socket.on('cancelWaiting', () => {
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }
  });

  socket.on('play', (index) => {
    const game = games[socket.gameId];
    if (!game || game.winner) return;
    if (game.players[game.currentPlayer] !== socket.id) return;
    makeMove(socket.gameId, index);
  });

socket.on('rematchSame', () => {
    const game = games[socket.gameId];
    if (!game) return;
    game.rematchVotes[socket.id] = 'same';
    const playerIds = [game.players.X, game.players.O];
    const bothVoted = playerIds.every(id => game.rematchVotes[id]);
    if (bothVoted) {
      if (game.timer) clearInterval(game.timer);
      game.board = ['', '', '', '', '', '', '', '', ''];
      game.currentPlayer = 'X';
      game.winner = null;
      game.rematchVotes = {};
      io.to(game.players.X).emit('gameStart', { symbol: 'X', gameId: socket.gameId });
      io.to(game.players.O).emit('gameStart', { symbol: 'O', gameId: socket.gameId });
      setTimeout(() => {
        sendGameState(socket.gameId);
        startTimer(socket.gameId);
      }, 100);
    } else {
      const otherId = game.players.X === socket.id ? game.players.O : game.players.X;
      io.to(otherId).emit('opponentWantsRematch');
    }
  });

  socket.on('rematchRandom', () => {
    const game = games[socket.gameId];
    if (game) {
      if (game.timer) clearInterval(game.timer);
      const otherId = game.players.X === socket.id ? game.players.O : game.players.X;
      io.to(otherId).emit('opponentLeft');
      delete games[socket.gameId];
    }
    socket.gameId = null;
    socket.symbol = null;
    if (waitingPlayer && waitingPlayer.id !== socket.id) {
      createGame(waitingPlayer, socket);
      waitingPlayer = null;
    } else {
      waitingPlayer = socket;
      socket.emit('waiting');
    }
  });

  socket.on('disconnect', () => {
    if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
    const game = games[socket.gameId];
    if (game) {
      if (game.timer) clearInterval(game.timer);
      const otherId = game.players.X === socket.id ? game.players.O : game.players.X;
      io.to(otherId).emit('opponentLeft');
      delete games[socket.gameId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});