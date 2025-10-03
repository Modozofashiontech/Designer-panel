// config.js

// Utility: remove trailing slashes from URLs
const cleanUrl = (url) => url.replace(/\/+$/, '');

// Fallback to localhost for development
const rawApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const API_BASE = cleanUrl(rawApiUrl);

// SOCKET_URL: Use REACT_APP_SOCKET_URL if provided, else derive from API_BASE
// Converts http(s) → ws(s) for proper WebSocket protocol
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || API_BASE.replace(/^http/, 'ws');

export { API_BASE, SOCKET_URL };
