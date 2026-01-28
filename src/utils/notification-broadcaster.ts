import { connectionManager } from './websocket-manager';
import { Notification } from '../types';

/**
 * Envia uma notificação via WebSocket para o usuário específico
 */
export function broadcastNotification(notification: Notification): void {
  if (!notification.userId) {
    return;
  }

  const message = {
    type: 'notification',
    data: notification,
  };

  connectionManager.broadcastToUser(notification.userId, message);
}

/**
 * Envia notificação para todos os usuários inscritos em notificações
 * (fallback caso não tenha userId específico)
 */
export function broadcastNotificationToAll(notification: Notification): void {
  const message = {
    type: 'notification',
    data: notification,
  };

  connectionManager.broadcastToNotifications(message);
}
