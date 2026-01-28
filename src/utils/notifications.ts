import { prisma } from '../config/database';
import { NotificationType } from '../types';
import { broadcastNotification } from './notification-broadcaster';

/**
 * Cria uma notificação no banco de dados
 */
export async function createNotification(data: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  receiptId?: string;
  relatedUserId?: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      receiptId: data.receiptId || null,
      relatedUserId: data.relatedUserId || null,
      isRead: false,
    },
  });

  // Broadcast via WebSocket (não bloqueia se falhar)
  try {
    broadcastNotification({
      id: notification.id,
      userId: notification.userId,
      type: notification.type as NotificationType,
      title: notification.title,
      message: notification.message,
      receiptId: notification.receiptId || undefined,
      relatedUserId: notification.relatedUserId || undefined,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
    });
  } catch (error) {
    // Log mas não falha a criação da notificação
    console.error('Error broadcasting notification:', error);
  }

  return notification;
}

/**
 * Notifica todos os participantes quando um recibo é fechado
 */
export async function notifyReceiptClosed(receiptId: string, creatorId: string) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      receiptParticipants: {
        include: {
          participant: true,
        },
      },
      creator: true,
    },
  });

  if (!receipt) {
    return;
  }

  // Notifica todos os participantes (exceto o criador)
  const participantUserIds = receipt.receiptParticipants
    .map((rp) => rp.participant.userId)
    .filter((userId): userId is string => userId !== null && userId !== creatorId);

  const notifications = participantUserIds.map((userId) =>
    createNotification({
      userId,
      type: 'receipt_closed',
      title: 'Recibo Fechado',
      message: `O recibo "${receipt.title}" foi fechado por ${receipt.creator.name || receipt.creator.email}`,
      receiptId,
      relatedUserId: creatorId,
    })
  );

  await Promise.all(notifications);
}

/**
 * Notifica participantes quando um item é adicionado
 */
export async function notifyItemAdded(
  receiptId: string,
  itemId: string,
  addedBy: string
) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      receiptItems: {
        where: { id: itemId },
        include: {
          participant: true,
        },
      },
      receiptParticipants: {
        include: {
          participant: true,
        },
      },
    },
  });

  if (!receipt || !receipt.receiptItems[0]) {
    return;
  }

  const item = receipt.receiptItems[0];
  const addedByUser = await prisma.sharezinUser.findUnique({
    where: { id: addedBy },
  });

  // Notifica todos os participantes (exceto quem adicionou)
  const participantUserIds = receipt.receiptParticipants
    .map((rp) => rp.participant.userId)
    .filter((userId): userId is string => userId !== null && userId !== addedBy);

  const notifications = participantUserIds.map((userId) =>
    createNotification({
      userId,
      type: 'item_added',
      title: 'Novo Item Adicionado',
      message: `${addedByUser?.name || addedByUser?.email || 'Alguém'} adicionou "${item.name}" ao recibo "${receipt.title}"`,
      receiptId,
      relatedUserId: addedBy,
    })
  );

  await Promise.all(notifications);
}

/**
 * Notifica o criador sobre uma solicitação de participação
 */
export async function notifyParticipantRequest(
  receiptId: string,
  requesterId: string,
  creatorId: string
) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
  });

  const requester = await prisma.sharezinUser.findUnique({
    where: { id: requesterId },
  });

  if (!receipt || !requester) {
    return;
  }

  await createNotification({
    userId: creatorId,
    type: 'participant_request',
    title: 'Nova Solicitação de Participação',
    message: `${requester.name || requester.email} solicitou entrada no recibo "${receipt.title}"`,
    receiptId,
    relatedUserId: requesterId,
  });
}

/**
 * Notifica sobre transferência de criador
 */
export async function notifyCreatorTransferred(
  receiptId: string,
  oldCreatorId: string,
  newCreatorId: string
) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
  });

  const oldCreator = await prisma.sharezinUser.findUnique({
    where: { id: oldCreatorId },
  });

  const newCreator = await prisma.sharezinUser.findUnique({
    where: { id: newCreatorId },
  });

  if (!receipt || !oldCreator || !newCreator) {
    return;
  }

  // Notifica o novo criador
  await createNotification({
    userId: newCreatorId,
    type: 'creator_transferred',
    title: 'Você é o novo responsável',
    message: `${oldCreator.name || oldCreator.email} transferiu a responsabilidade do recibo "${receipt.title}" para você`,
    receiptId,
    relatedUserId: oldCreatorId,
  });

  // Notifica o antigo criador
  await createNotification({
    userId: oldCreatorId,
    type: 'creator_transferred_from',
    title: 'Responsabilidade Transferida',
    message: `Você transferiu a responsabilidade do recibo "${receipt.title}" para ${newCreator.name || newCreator.email}`,
    receiptId,
    relatedUserId: newCreatorId,
  });
}

/**
 * Notifica sobre aprovação de participante
 */
export async function notifyParticipantApproved(
  receiptId: string,
  participantId: string,
  creatorId: string
) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
  });

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      user: true,
    },
  });

  const creator = await prisma.sharezinUser.findUnique({
    where: { id: creatorId },
  });

  if (!receipt || !participant || !participant.userId || !creator) {
    return;
  }

  await createNotification({
    userId: participant.userId,
    type: 'participant_approved',
    title: 'Participação Aprovada',
    message: `${creator.name || creator.email} aprovou sua solicitação de participação no recibo "${receipt.title}"`,
    receiptId,
    relatedUserId: creatorId,
  });
}

/**
 * Notifica sobre rejeição de participante
 */
export async function notifyParticipantRejected(
  receiptId: string,
  participantId: string,
  creatorId: string
) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
  });

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      user: true,
    },
  });

  const creator = await prisma.sharezinUser.findUnique({
    where: { id: creatorId },
  });

  if (!receipt || !participant || !participant.userId || !creator) {
    return;
  }

  await createNotification({
    userId: participant.userId,
    type: 'participant_rejected',
    title: 'Participação Rejeitada',
    message: `${creator.name || creator.email} rejeitou sua solicitação de participação no recibo "${receipt.title}"`,
    receiptId,
    relatedUserId: creatorId,
  });
}
