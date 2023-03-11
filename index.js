const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

let lastReset = Date.now();
const RESET_THRESHOLD = 300;

const initialState = {
  count: {
    ele: 0,
    mouse: 0,
  },
  resetCount: 0,
};
const persistentState = {
  clients: [],
  lastReset:  Date.now(),
}

let gameState = structuredClone(initialState);

app.use(express.static(__dirname + "/public"));

const formatTime = (ms) => {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / 1000 / 60) % 60);
  const hours = Math.floor((ms  / 1000 / 3600 ) % 24)

  const humanized = [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
  ].join(':');

  return humanized;
}

const resetState = () => {
  io.emit('reset_state');
  gameState = structuredClone(initialState);
  console.log(`Resetting state. Time since last reset: ${formatTime((Date.now() - persistentState.lastReset))}`)
  persistentState.lastReset = Date.now();
}

io.on('connection', (socket) => {
  // Add the client to the list of active clients
  persistentState.clients.push(socket);
  console.log(`Client connected. Total: ${persistentState.clients.length}`);
  io.emit('connected_updated', persistentState.clients.length);

  // Send the current count to the client
  socket.emit('current_state', { connectedUsers: persistentState.clients.length, count: gameState.count });

  // Listen for the "increment_count" event from the client
  socket.on('add_animal', ({ animal, x, y }) => {
    // Increment the count and send it back to all connected clients
    gameState.count[animal] = (gameState.count[animal] || 0) + 1;
    io.emit(`animal_updated`, { count: gameState.count[animal], animal, pos: { x, y } });
    gameState.resetCount++;
    if (gameState.resetCount >= RESET_THRESHOLD) {
      resetState();
    }
  });

  socket.on('reset', () => {
    gameState.resetCount++
    console.log('new reset count:', gameState.resetCount)
    if (gameState.resetCount >= RESET_THRESHOLD) {
      resetState()
    }
  })

  // Listen for the disconnect event
  socket.on('disconnect', () => {
    // Remove the client to the list of active clients
    const index = persistentState.clients.indexOf(socket);
    persistentState.clients.splice(index, 1);

    io.emit('connected_updated', persistentState.clients.length);
    console.log(`Client disconnected. Total: ${persistentState.clients.length}`);
  });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});