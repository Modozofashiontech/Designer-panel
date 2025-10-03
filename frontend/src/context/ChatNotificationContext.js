import React, { createContext, useContext, useState, useEffect } from 'react';
import socket from '../socket';

const ChatNotificationContext = createContext();

export const ChatNotificationProvider = ({ children }) => {
  // Chat States
  const [unreadMessages, setUnreadMessages] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  
  // Notification States
  const [notifications, setNotifications] = useState([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  useEffect(() => {
    // Listen for new notification events
    const onNotification = (notif) => {
      addNewNotification(notif);
    };
    const onChatMessage = (msg) => {
      addNewMessage(msg);
    };
    socket.on('notification', onNotification);
    socket.on('chat-message', onChatMessage);
    return () => {
      socket.off('notification', onNotification);
      socket.off('chat-message', onChatMessage);
    };
  }, []);

  const markNotificationAsRead = (notificationId) => {
    setNotifications(prevNotifications =>
      prevNotifications.map(notification =>
        notification.id === notificationId
          ? { ...notification, read: true }
          : notification
      )
    );
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prevNotifications =>
      prevNotifications.map(notification => ({ ...notification, read: true }))
    );
  };

  const markMessageAsRead = (messageId) => {
    setChatMessages(prevMessages =>
      prevMessages.map(message =>
        message.id === messageId
          ? { ...message, read: true }
          : message
      )
    );
    updateUnreadMessages();
  };

  const markAllMessagesAsRead = () => {
    setChatMessages(prevMessages =>
      prevMessages.map(message => ({ ...message, read: true }))
    );
    setUnreadMessages([]);
  };

  const updateUnreadMessages = () => {
    setUnreadMessages(chatMessages.filter(msg => !msg.read));
  };

  const addNewMessage = (message) => {
    const newMessage = {
      id: Date.now(),
      ...message,
      read: false,
      time: message.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, newMessage]);
    updateUnreadMessages();
  };

  const addNewNotification = (notification) => {
    const newNotification = {
      id: Date.now(),
      ...notification,
      read: false,
      time: notification.time || 'Just now'
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  const value = {
    notifications,
    isNotificationOpen,
    setIsNotificationOpen,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    addNewNotification,
    chatMessages,
    unreadMessages,
    isChatOpen,
    setIsChatOpen,
    markMessageAsRead,
    markAllMessagesAsRead,
    addNewMessage
  };

  return (
    <ChatNotificationContext.Provider value={value}>
      {children}
    </ChatNotificationContext.Provider>
  );
};

export const useChatNotification = () => {
  const context = useContext(ChatNotificationContext);
  if (!context) {
    throw new Error('useChatNotification must be used within a ChatNotificationProvider');
  }
  return context;
}; 