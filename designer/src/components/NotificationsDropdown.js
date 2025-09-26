import React from 'react';
import { useChatNotification } from '../context/ChatNotificationContext';

const NotificationsDropdown = () => {
  const {
    notifications,
    isNotificationOpen,
    setIsNotificationOpen,
    markNotificationAsRead,
    markAllNotificationsAsRead
  } = useChatNotification();

  if (!isNotificationOpen) return null;

  return (
    <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl z-50">
      {/* Notifications Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800">Notifications</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={markAllNotificationsAsRead}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Mark all as read
          </button>
          <button
            onClick={() => setIsNotificationOpen(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No notifications
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => markNotificationAsRead(notification.id)}
              className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                !notification.read ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900">
                    {notification.title}
                  </h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {notification.message}
                  </p>
                  <span className="text-xs text-gray-500 mt-1">
                    {notification.time}
                  </span>
                </div>
                {!notification.read && (
                  <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationsDropdown; 