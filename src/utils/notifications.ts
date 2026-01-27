import { prisma } from '../config/database';
import type { NotificationType } from '../types';

/**
 * Cria uma notificação. Falhas não devem quebrar a operação principal (log e ignore).
 */
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  receiptId?: string;
  relatedUserId?: string;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        receiptId: params.receiptId,
        relatedUserId: params.relatedUserId,
      },
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

/**
 * Notifica todos os participantes quando o recibo é fechado.
 */
export async function notifyReceiptClosed(params: {
  receiptId: string;
  receiptTitle: string;
  creatorId: string;
  participantUserIds: string[];
}): Promise<void> {
  const { receiptId, receiptTitle, creatorId, participantUserIds } = params;
  const message = `O recibo "${receiptTitle}" foi fechado.`;
  const title = 'Recibo fechado';

  for (const userId of participantUserIds) {
    if (userId === creatorId) continue;
    await createNotification({
      userId,
      type: 'receipt_closed',
      title,
      message,
      receiptId,
    });
  }
}

/**
 * Notifica outros participantes quando um item é adicionado.
 */
export async function notifyItemAdded(params: {
  receiptId: string;
  receiptTitle: string;
  itemName: string;
  addedByUserId: string;
  participantUserIds: string[];
}): Promise<void> {
  const { receiptId, receiptTitle, itemName, addedByUserId, participantUserIds } = params;
  const message = `"${itemName}" foi adicionado ao recibo "${receiptTitle}".`;
  const title = 'Novo item';

  for (const userId of participantUserIds) {
    if (userId === addedByUserId) continue;
    await createNotification({
      userId,
      type: 'item_added',
      title,
      message,
      receiptId,
      relatedUserId: addedByUserId,
    });
  }
}

/**
 * Notifica o criador sobre solicitação de entrada.
 */
export async function notifyParticipantRequest(params: {
  receiptId: string;
  receiptTitle: string;
  creatorUserId: string;
  requesterName: string;
  requesterUserId: string;
}): Promise<void> {
  await createNotification({
    userId: params.creatorUserId,
    type: 'participant_request',
    title: 'Solicitação de entrada',
    message: `${params.requesterName} solicitou entrar no recibo "${params.receiptTitle}".`,
    receiptId: params.receiptId,
    relatedUserId: params.requesterUserId,
  });
}

/**
 * Notifica o novo criador e o criador antigo sobre a transferência.
 */
export async function notifyCreatorTransferred(params: {
  receiptId: string;
  receiptTitle: string;
  newCreatorUserId: string;
  previousCreatorUserId: string;
}): Promise<void> {
  await createNotification({
    userId: params.newCreatorUserId,
    type: 'creator_transferred',
    title: 'Você é o novo responsável',
    message: `A responsabilidade do recibo "${params.receiptTitle}" foi transferida para você.`,
    receiptId: params.receiptId,
    relatedUserId: params.previousCreatorUserId,
  });

  await createNotification({
    userId: params.previousCreatorUserId,
    type: 'creator_transferred_from',
    title: 'Responsabilidade transferida',
    message: `A responsabilidade do recibo "${params.receiptTitle}" foi transferida para outro participante.`,
    receiptId: params.receiptId,
    relatedUserId: params.newCreatorUserId,
  });
}
