import { requestPermission, onMessageListener } from '../firebase';
import { getMessaging } from 'firebase/messaging';
import { initializeApp } from 'firebase/app';

export class NotificationsService {
  constructor() {
    this.token = null;
    this.notificationHandlers = new Set();
  }

  async initialize() {
    this.token = await requestPermission();
    if (this.token) {
      this.setupListeners();
    }
  }

  setupListeners() {
    onMessageListener().then((payload) => {
      const notification = {
        title: payload.notification.title,
        body: payload.notification.body,
        data: payload.data
      };
      
      // Notify all registered handlers
      this.notificationHandlers.forEach(handler => handler(notification));
    });
  }

  addNotificationHandler(handler) {
    this.notificationHandlers.add(handler);
  }

  removeNotificationHandler(handler) {
    this.notificationHandlers.delete(handler);
  }

  // Send notification to specific user
  static async sendNotification(userId, title, body, data) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `key=YOUR_SERVER_KEY` // Get this from Firebase Console
    };

    const message = {
      to: userId,
      notification: {
        title,
        body
      },
      data
    };

    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(message)
      });
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const notificationsService = new NotificationsService();
