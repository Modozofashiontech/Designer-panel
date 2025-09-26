// Centralized runtime config for API and service endpoints
const config = {
  // API Configuration
  API_BASE: process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:5000`,
  API_ENDPOINT: process.env.REACT_APP_API_URL ? 
    `${process.env.REACT_APP_API_URL}/api` : 
    `${window.location.protocol}//${window.location.hostname}:5000/api`,
  
  // Python Service
  PYTHON_SERVICE: process.env.REACT_APP_PYTHON_SERVICE || 
    `${window.location.protocol}//${window.location.hostname}:5001`,
  PYTHON_BASE_URL: process.env.REACT_APP_PYTHON_SERVICE || 
    `${window.location.protocol}//${window.location.hostname}:5001`,
  
  // WebSocket Configuration
  SOCKET_URL: process.env.REACT_APP_SOCKET_URL || 
    (process.env.REACT_APP_API_URL ? 
      process.env.REACT_APP_API_URL.replace(/^http/, 'ws') : 
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:5000`),
  
  // AWS Configuration
  AWS_REGION: process.env.REACT_APP_AWS_REGION || 'ap-south-1',
  
  // Avatar Service
  AVATAR_SERVICE: 'https://ui-avatars.com/api',
  
  // Default Avatar Settings
  AVATAR_SETTINGS: {
    background: '0D8ABC',
    color: 'fff',
    size: 128
  }
};

// Create full API URLs
const API_BASE = config.API_BASE;
const API_ENDPOINT = config.API_ENDPOINT;
const PYTHON_SERVICE = config.PYTHON_SERVICE;
const SOCKET_URL = config.SOCKET_URL;
const AWS_REGION = config.AWS_REGION;

// Export all configurations
export { 
  API_BASE,
  API_ENDPOINT,
  PYTHON_SERVICE,
  SOCKET_URL,
  AWS_REGION,
  config as default 
};
