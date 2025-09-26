import React, { useState } from 'react';
import { useChatNotification } from '../context/ChatNotificationContext';

const ChatWindow = () => {
  const {
    chatMessages,
    isChatOpen,
    setIsChatOpen,
    markMessageAsRead,
    markAllMessagesAsRead,
    addNewMessage
  } = useChatNotification();

  const [newMessage, setNewMessage] = useState('');

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      addNewMessage({
        sender: 'You',
        message: newMessage.trim()
      });
      setNewMessage('');
    }
  };

  if (!isChatOpen) return null;

  return (
    <div className="fixed right-4 bottom-4 w-80 bg-white rounded-lg shadow-xl z-50">
      {/* Chat Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800">Messages</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={markAllMessagesAsRead}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Mark all as read
          </button>
          <button
            onClick={() => setIsChatOpen(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="h-96 overflow-y-auto p-4 space-y-4">
        {chatMessages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'You' ? 'justify-end' : 'justify-start'}`}
            onClick={() => markMessageAsRead(message.id)}
          >
            <div
              className={`max-w-xs p-3 rounded-lg ${
                message.sender === 'You'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="text-sm font-medium mb-1">{message.sender}</div>
              <div className="text-sm">{message.message}</div>
              <div className={`text-xs mt-1 ${
                message.sender === 'You' ? 'text-blue-100' : 'text-gray-500'
              }`}>
                {message.time}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="border-t border-gray-200 p-4">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatWindow; 