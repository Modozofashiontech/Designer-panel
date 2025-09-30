// Centralized runtime config for API and Socket endpoints
// Default to localhost:8080 for development
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:8080';

export { API_BASE, SOCKET_URL };
