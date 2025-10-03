import React, { useState, useEffect } from 'react';
import { useNotifications } from '../context/NotificationContext';
import Notification from './Notification';
import { BellIcon } from '@heroicons/react/24/outline';

const NotificationCenter = () => {
  const { notifications, markAsRead, removeNotification } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Count unread notifications
    const count = notifications.filter(n => !n.read).length;
    setUnreadCount(count);
    
    // Auto-close after 5 seconds if there are unread notifications
    if (count > 0 && !isOpen) {
      const timer = setTimeout(() => {
        setIsOpen(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notifications, isOpen]);

  const toggleNotifications = () => {
    setIsOpen(!isOpen);
    // Mark all as read when opening
    if (!isOpen) {
      notifications.forEach(notification => {
        if (!notification.read) {
          markAsRead(notification.id);
        }
      });
    }
  };

  const handleDismiss = (id) => {
    removeNotification(id);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleNotifications}
        className="relative p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-full"
      >
        <span className="sr-only">View notifications</span>
        <BellIcon className="h-6 w-6" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-400 ring-2 ring-white">
            <span className="sr-only">{unreadCount} unread notifications</span>
          </span>
        )}
      </button>

      {/* Notification panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 overflow-hidden z-50">
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">Notifications</h3>
              <span className="text-sm text-gray-500">
                {notifications.length} total
              </span>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No notifications
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {notifications.map((notification) => (
                  <div key={notification.id} className="p-4 hover:bg-gray-50">
                    <Notification
                      notification={notification}
                      onDismiss={() => handleDismiss(notification.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          {notifications.length > 0 && (
            <div className="p-2 bg-gray-50 text-right">
              <button
                onClick={() => {
                  notifications.forEach(n => removeNotification(n.id));
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
