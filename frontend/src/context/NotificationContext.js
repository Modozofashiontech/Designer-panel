import React, { createContext, useContext, useState, useEffect } from 'react';
import socket from '../socket';
import { v4 as uuidv4 } from 'uuid';

const NotificationContext = createContext();

export const useNotifications = () => {
  return useContext(NotificationContext);
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = (notification) => {
    const id = uuidv4();
    const newNotification = {
      id,
      ...notification,
      timestamp: new Date(),
      read: false
    };
    
    setNotifications(prev => [newNotification, ...prev].slice(0, 50)); // Keep last 50 notifications
    
    // Auto-remove notification after 10 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 10000);
    
    return id;
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAsRead = (id) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  useEffect(() => {
    console.log('🔌 Setting up socket connection and listeners');
    
    // Connection status listeners
    socket.on('connect', () => {
      console.log('✅ Connected to WebSocket server');
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from WebSocket server:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
    });

    // Listen for new notifications from the server
    const handleNewNotification = (notification) => {
      console.log('📨 Received notification:', notification);
      try {
        const newNotification = {
          ...notification,
          type: notification.type || 'info',
          timestamp: new Date(notification.timestamp || Date.now())
        };
        console.log('📝 Adding notification to state:', newNotification);
        addNotification(newNotification);
      } catch (error) {
        console.error('❌ Error processing notification:', error, notification);
      }
    };

    socket.on('notification', handleNewNotification);

    // Log all socket events for debugging
    const logEvent = (event, ...args) => {
      if (event !== 'notification') { // Skip duplicate notification logs
        console.log(`🔔 Socket event: ${event}`, args);
      }
    };
    
    socket.onAny(logEvent);

    return () => {
      console.log('🧹 Cleaning up socket listeners');
      socket.off('notification', handleNewNotification);
      socket.offAny(logEvent);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        markAsRead
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
