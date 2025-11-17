const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const waitingPlayers = [];
const activeGames = new Map();
const playerToGame = new Map();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('find-match', () => {
      console.log('Player looking for match:', socket.id);
      
      if (waitingPlayers.length > 0) {
        const opponent = waitingPlayers.shift();
        const gameId = `game-${Date.now()}`;
        
        const isPlayer1 = Math.random() < 0.5;
        const player1 = isPlayer1 ? socket.id : opponent;
        const player2 = isPlayer1 ? opponent : socket.id;
        
        const game = {
          id: gameId,
          player1: player1,
          player2: player2,
          secretWord: null,
          messages: [],
          startTime: null,
          pendingQuestion: null
        };
        
        activeGames.set(gameId, game);
        playerToGame.set(player1, gameId);
        playerToGame.set(player2, gameId);
        
        io.sockets.sockets.get(player1).join(gameId);
        io.sockets.sockets.get(player2).join(gameId);
        
        io.to(player1).emit('match-found', { 
          gameId, 
          role: 'player1',
          opponentId: player2 
        });
        io.to(player2).emit('match-found', { 
          gameId, 
          role: 'player2',
          opponentId: player1 
        });
        
        console.log('Match created:', gameId);
      } else {
        waitingPlayers.push(socket.id);
        socket.emit('waiting');
      }
    });

    socket.on('set-word', (word) => {
      const gameId = playerToGame.get(socket.id);
      if (!gameId) return;
      
      const game = activeGames.get(gameId);
      if (!game || game.player1 !== socket.id) return;
      
      game.secretWord = word.trim().toLowerCase();
      game.startTime = Date.now();
      
      io.to(gameId).emit('game-started', {
        message: 'Game started! Player 2 has 3 minutes to guess the word.'
      });
    });

    socket.on('ask-question', (question) => {
      const gameId = playerToGame.get(socket.id);
      if (!gameId) return;
      
      const game = activeGames.get(gameId);
      if (!game || game.player2 !== socket.id) return;
      
      const message = {
        type: 'player2',
        text: question,
        timestamp: Date.now()
      };
      
      game.messages.push(message);
      game.pendingQuestion = question;
      
      io.to(gameId).emit('new-message', message);
      io.to(game.player1).emit('question-pending', question);
    });

    socket.on('answer', (answer) => {
      const gameId = playerToGame.get(socket.id);
      if (!gameId) return;
      
      const game = activeGames.get(gameId);
      if (!game || game.player1 !== socket.id || !game.pendingQuestion) return;
      
      const message = {
        type: 'player1',
        text: answer,
        timestamp: Date.now()
      };
      
      game.messages.push(message);
      game.pendingQuestion = null;
      
      io.to(gameId).emit('new-message', message);
      io.to(game.player2).emit('answer-received');
    });

    socket.on('make-guess', (guess) => {
      const gameId = playerToGame.get(socket.id);
      if (!gameId) return;
      
      const game = activeGames.get(gameId);
      if (!game || game.player2 !== socket.id) return;
      
      const isCorrect = guess.trim().toLowerCase() === game.secretWord;
      
      if (isCorrect) {
        const timeElapsed = Math.floor((Date.now() - game.startTime) / 1000);
        io.to(gameId).emit('game-ended', {
          won: true,
          word: game.secretWord,
          timeElapsed: timeElapsed
        });
        
        cleanupGame(gameId);
      } else {
        const wrongMessage = {
          type: 'player2',
          text: `Is it "${guess}"?`,
          timestamp: Date.now()
        };
        const noMessage = {
          type: 'player1',
          text: 'No',
          timestamp: Date.now()
        };
        
        game.messages.push(wrongMessage, noMessage);
        io.to(gameId).emit('new-message', wrongMessage);
        io.to(gameId).emit('new-message', noMessage);
      }
    });

    socket.on('time-expired', () => {
      const gameId = playerToGame.get(socket.id);
      if (!gameId) return;
      
      const game = activeGames.get(gameId);
      if (!game) return;
      
      io.to(gameId).emit('game-ended', {
        won: false,
        word: game.secretWord,
        timeElapsed: 180
      });
      
      cleanupGame(gameId);
    });

    socket.on('disconnect', () => {
      console.log('Player disconnected:', socket.id);
      
      const waitingIndex = waitingPlayers.indexOf(socket.id);
      if (waitingIndex > -1) {
        waitingPlayers.splice(waitingIndex, 1);
      }
      
      const gameId = playerToGame.get(socket.id);
      if (gameId) {
        const game = activeGames.get(gameId);
        if (game) {
          const opponentId = game.player1 === socket.id ? game.player2 : game.player1;
          io.to(opponentId).emit('opponent-disconnected');
          cleanupGame(gameId);
        }
      }
    });
  });

  function cleanupGame(gameId) {
    const game = activeGames.get(gameId);
    if (game) {
      playerToGame.delete(game.player1);
      playerToGame.delete(game.player2);
      activeGames.delete(gameId);
    }
  }

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});