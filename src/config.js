// Centralized runtime config for API and Socket endpoints
// Use REACT_APP_API_URL and REACT_APP_SOCKET_URL when running the React app

// In production, these should be set to your DigitalOcean backend URL
// For DigitalOcean App Platform, set these as environment variables in your app settings
const API_BASE = process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? (process.env.REACT_APP_BACKEND_URL || 'https://your-backend-app.do.com')
    : 'http://localhost:5000');

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL ||
  (process.env.NODE_ENV === 'production'
    ? (process.env.REACT_APP_BACKEND_URL || 'https://your-backend-app.do.com')
    : API_BASE);

export { API_BASE, SOCKET_URL };
