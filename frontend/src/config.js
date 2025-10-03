// config.js

// Utility: remove trailing slashes from URLs
const cleanUrl = (url) => url.replace(/\/+$/, '');

// Fallback to localhost for development
const rawApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const API_BASE = cleanUrl(rawApiUrl);

// SOCKET_URL: Use REACT_APP_SOCKET_URL if provided, else derive from API_BASE
// For DigitalOcean App Platform, we need to handle both HTTP and HTTPS properly
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || (() => {
  // If API_BASE is HTTPS, use WSS for WebSocket
  if (API_BASE.startsWith('https://')) {
    return API_BASE.replace(/^http/, 'ws');
  }
  // For HTTP or development, use WS
  return API_BASE.replace(/^http/, 'ws');
})();

export { API_BASE, SOCKET_URL };
