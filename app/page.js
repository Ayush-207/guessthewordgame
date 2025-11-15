'use client';

import { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import { MessageCircle, Clock, User } from 'lucide-react';

let socket;

export default function Home() {
  const [gameState, setGameState] = useState({
    status: 'menu',
    role: null,
    gameId: null,
    messages: [],
    timeLeft: 180,
    pendingQuestion: false,
    secretWord: '',
    endMessage: ''
  });

  const [currentQuestion, setCurrentQuestion] = useState('');
  const [secretWordInput, setSecretWordInput] = useState('');
  const chatEndRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    socketInitializer();

    return () => {
      if (socket) socket.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState.messages]);

  const socketInitializer = async () => {
    socket = io();

    socket.on('waiting', () => {
      setGameState(prev => ({ ...prev, status: 'waiting' }));
    });

    socket.on('match-found', (data) => {
      setGameState(prev => ({
        ...prev,
        gameId: data.gameId,
        role: data.role,
        status: data.role === 'player1' ? 'setup' : 'playing',
        messages: data.role === 'player2' ? [{
          type: 'system',
          text: 'Waiting for Player 1 to set the word...'
        }] : []
      }));
    });

    socket.on('game-started', (data) => {
      setGameState(prev => ({
        ...prev,
        status: 'playing',
        messages: [{ type: 'system', text: data.message }],
        timeLeft: 180
      }));
      startTimer();
    });

    socket.on('new-message', (message) => {
      setGameState(prev => ({
        ...prev,
        messages: [...prev.messages, message]
      }));
    });

    socket.on('question-pending', () => {
      setGameState(prev => ({ ...prev, pendingQuestion: true }));
    });

    socket.on('answer-received', () => {
      setGameState(prev => ({ ...prev, pendingQuestion: false }));
    });

    socket.on('game-ended', (data) => {
      if (timerRef.current) clearInterval(timerRef.current);
      
      const endMessage = data.won
        ? `🎉 Player 2 guessed the word "${data.word}" in ${Math.floor(data.timeElapsed / 60)}:${(data.timeElapsed % 60).toString().padStart(2, '0')}!`
        : `⏰ Time's up! The word was "${data.word}"`;
      
      setGameState(prev => ({
        ...prev,
        status: 'ended',
        endMessage
      }));
    });

    socket.on('opponent-disconnected', () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setGameState(prev => ({
        ...prev,
        status: 'ended',
        endMessage: '😔 Your opponent disconnected. The game has ended.'
      }));
    });
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    timerRef.current = setInterval(() => {
      setGameState(prev => {
        const newTimeLeft = prev.timeLeft - 1;
        
        if (newTimeLeft <= 0) {
          clearInterval(timerRef.current);
          socket.emit('time-expired');
          return { ...prev, timeLeft: 0 };
        }
        
        return { ...prev, timeLeft: newTimeLeft };
      });
    }, 1000);
  };

  const findMatch = () => {
    setGameState(prev => ({ ...prev, status: 'waiting' }));
    socket.emit('find-match');
  };

  const setWord = () => {
    if (!secretWordInput.trim()) {
      alert('Please enter a word!');
      return;
    }
    socket.emit('set-word', secretWordInput);
  };

  const askQuestion = () => {
    if (!currentQuestion.trim()) return;
    socket.emit('ask-question', currentQuestion);
    setCurrentQuestion('');
  };

  const sendAnswer = (answer) => {
    socket.emit('answer', answer);
  };

  const makeGuess = () => {
    const guess = prompt('Enter your guess:');
    if (!guess) return;
    socket.emit('make-guess', guess);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (gameState.status === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center">
            <MessageCircle className="w-20 h-20 mx-auto mb-4 text-purple-600" />
            <h1 className="text-4xl font-bold text-gray-800 mb-4">Guess the Word</h1>
            <p className="text-gray-600 mb-8">Find a match and play with another player online!</p>
            <button
              onClick={findMatch}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-lg text-xl font-semibold hover:from-purple-700 hover:to-blue-700 transition-all"
            >
              Find Match
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.status === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Finding a match...</h2>
            <p className="text-gray-600">Waiting for another player to join</p>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.status === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl overflow-hidden max-w-md w-full">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
            <h1 className="text-3xl font-bold text-center">Guess the Word</h1>
          </div>
          <div className="p-8">
            <div className="text-center">
              <User className="w-12 h-12 mx-auto text-purple-600 mb-4" />
              <h2 className="text-2xl font-bold text-gray-800 mb-4">You are Player 1!</h2>
              <p className="text-gray-600 mb-6">Enter a secret word for Player 2 to guess</p>
              <input
                type="password"
                value={secretWordInput}
                onChange={(e) => setSecretWordInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && setWord()}
                placeholder="Enter the secret word..."
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-600 focus:outline-none text-lg mb-4"
              />
              <button
                onClick={setWord}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition-all"
              >
                Start Game
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.status === 'playing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Guess the Word</h1>
                <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg">
                  <Clock size={20} />
                  <span className="text-xl font-mono font-bold">{formatTime(gameState.timeLeft)}</span>
                </div>
              </div>
              <p className="text-sm mt-2 opacity-90">
                You are {gameState.role === 'player1' ? 'Player 1 (Answer questions)' : 'Player 2 (Ask questions)'}
              </p>
            </div>

            <div className="flex flex-col h-[600px]">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {gameState.messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.type === 'player2' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.type === 'system' ? (
                      <div className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg max-w-md text-center mx-auto">
                        {msg.text}
                      </div>
                    ) : (
                      <div className={`px-4 py-2 rounded-lg max-w-md ${
                        msg.type === 'player1' 
                          ? 'bg-blue-100 text-blue-900' 
                          : 'bg-purple-100 text-purple-900'
                      }`}>
                        <div className="text-xs font-semibold mb-1">
                          {msg.type === 'player1' ? 'Player 1' : 'Player 2'}
                        </div>
                        <div>{msg.text}</div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {gameState.role === 'player1' && gameState.pendingQuestion && (
                <div className="bg-blue-50 border-t-2 border-blue-200 p-4">
                  <p className="text-sm text-gray-600 mb-3 text-center">Answer the question:</p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => sendAnswer('Yes')}
                      className="px-8 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-all"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => sendAnswer('No')}
                      className="px-8 py-3 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-all"
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {gameState.role === 'player2' && !gameState.pendingQuestion && (
                <div className="border-t-2 border-gray-200 p-4">
                  <p className="text-sm text-gray-600 mb-3 text-center">Ask a question or make a guess</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currentQuestion}
                      onChange={(e) => setCurrentQuestion(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && askQuestion()}
                      placeholder="Ask a yes/no question..."
                      className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-600 focus:outline-none"
                    />
                    <button
                      onClick={askQuestion}
                      className="px-6 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-all"
                    >
                      Ask
                    </button>
                    <button
                      onClick={makeGuess}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all"
                    >
                      Guess!
                    </button>
                  </div>
                </div>
              )}

              {gameState.role === 'player1' && !gameState.pendingQuestion && (
                <div className="border-t-2 border-gray-200 p-4 text-center text-gray-600">
                  <p>Waiting for Player 2 to ask a question...</p>
                </div>
              )}

              {gameState.role === 'player2' && gameState.pendingQuestion && (
                <div className="border-t-2 border-gray-200 p-4 text-center text-gray-600">
                  <p>Waiting for Player 1's answer...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.status === 'ended') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">Game Over!</h2>
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <p className="text-xl">{gameState.endMessage}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-lg text-xl font-semibold hover:from-purple-700 hover:to-blue-700 transition-all"
            >
              Play Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}