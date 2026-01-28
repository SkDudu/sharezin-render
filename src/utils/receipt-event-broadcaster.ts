import { connectionManager } from './websocket-manager';
import { prisma } from '../config/database';

export type ReceiptEventType =
  | 'receipt_updated'
  | 'receipt_closed'
  | 'item_added'
  | 'item_removed'
  | 'item_updated'
  | 'participant_added'
  | 'participant_removed'
  | 'participant_closed'
  | 'participant_requested'
  | 'participant_approved'
  | 'participant_rejected'
  | 'creator_transferred';

export interface ReceiptEventData {
  receiptId: string;
  event: ReceiptEventType;
  data?: any;
  timestamp?: string;
}

/**
 * Envia evento de recibo para todos os participantes conectados
 */
export async function broadcastReceiptEvent(
  receiptId: string,
  event: ReceiptEventType,
  data?: any
): Promise<number> {
  const message: ReceiptEventData = {
    receiptId,
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  // Envia para todos inscritos neste recibo específico
  return connectionManager.broadcastToReceipt(receiptId, {
    type: 'receipt_event',
    ...message,
  });
}

/**
 * Envia evento de recibo para usuários específicos
 */
export function broadcastReceiptEventToUsers(
  userIds: string[],
  receiptId: string,
  event: ReceiptEventType,
  data?: any
): number {
  const message: ReceiptEventData = {
    receiptId,
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  let sent = 0;
  userIds.forEach((userId) => {
    if (connectionManager.broadcastToUser(userId, { type: 'receipt_event', ...message }) > 0) {
      sent++;
    }
  });

  return sent;
}

/**
 * Obtém todos os user IDs dos participantes de um recibo
 */
export async function getReceiptParticipantUserIds(
  receiptId: string
): Promise<string[]> {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      receiptParticipants: {
        include: {
          participant: {
            select: {
              userId: true,
            },
          },
        },
      },
      creator: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!receipt) {
    return [];
  }

  const userIds = new Set<string>();
  
  // Adiciona criador
  userIds.add(receipt.creator.id);

  // Adiciona participantes
  receipt.receiptParticipants.forEach((rp) => {
    if (rp.participant.userId) {
      userIds.add(rp.participant.userId);
    }
  });

  return Array.from(userIds);
}

/**
 * Envia evento para todos os participantes de um recibo (incluindo criador)
 */
export async function broadcastReceiptEventToParticipants(
  receiptId: string,
  event: ReceiptEventType,
  data?: any
): Promise<number> {
  const userIds = await getReceiptParticipantUserIds(receiptId);
  return broadcastReceiptEventToUsers(userIds, receiptId, event, data);
}
