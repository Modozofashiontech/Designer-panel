// Centralized runtime config for API and Socket endpoints
// For DigitalOcean App Platform, use environment variables
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || API_BASE; // Use same domain for WebSocket

export { API_BASE, SOCKET_URL };
