// Centralized runtime config for API and Socket endpoints
// Use REACT_APP_API_URL and REACT_APP_SOCKET_URL when running the React app
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || API_BASE;

export { API_BASE, SOCKET_URL };
