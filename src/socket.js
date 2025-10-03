// src/socket.js
import { io } from 'socket.io-client';
import { SOCKET_URL } from './config';

// Use the configured socket URL (falls back to localhost:8080)
// For DigitalOcean App Platform, ensure WebSocket path is configured correctly
const socket = io(SOCKET_URL, {
  path: '/ws', // WebSocket path for DigitalOcean App Platform
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ['websocket', 'polling'],
  withCredentials: true
});

// Add connection status logging
socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server');});

socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected from WebSocket server:', reason);
  if (reason === 'io server disconnect') {
    // The disconnection was initiated by the server, you need to reconnect manually
    socket.connect();
  }
});

socket.on('connect_error', (error) => {
  console.error('❌ WebSocket connection error:', error);
});

export default socket;
