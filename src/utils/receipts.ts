import { prisma } from '../config/database';
import { Receipt } from '../types';
import { Receipt as PrismaReceipt } from '@prisma/client';

/**
 * Gera um código de convite único de 6-8 caracteres alfanuméricos
 */
export async function generateInviteCode(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code: string;
  let isUnique = false;

  while (!isUnique) {
    // Gera código de 6-8 caracteres
    const length = Math.floor(Math.random() * 3) + 6; // 6, 7 ou 8
    code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Verifica se já existe
    const existing = await prisma.receipt.findUnique({
      where: { inviteCode: code },
    });

    if (!existing) {
      isUnique = true;
    }
  }

  return code!;
}

/**
 * Calcula o total do recibo baseado nos itens, taxa de serviço e cover
 */
export function calculateReceiptTotal(
  itemsTotal: number,
  serviceChargePercent: number | null | undefined,
  cover: number | null | undefined
): number {
  const items = Number(itemsTotal) || 0;
  const serviceCharge = Number(serviceChargePercent) || 0;
  const coverAmount = Number(cover) || 0;

  const serviceChargeAmount = (items * serviceCharge) / 100;
  const total = items + serviceChargeAmount + coverAmount;

  return Math.round(total * 100) / 100; // Arredonda para 2 casas decimais
}

/**
 * Formata resposta do Prisma para o formato da API
 */
export function formatReceiptResponse(receipt: any): Receipt {
  return {
    id: receipt.id,
    title: receipt.title,
    date: receipt.date.toISOString(),
    creatorId: receipt.creatorId,
    inviteCode: receipt.inviteCode,
    participants: receipt.receiptParticipants?.map((rp: any) => ({
      id: rp.participant.id,
      name: rp.participant.name,
      userId: rp.participant.userId || undefined,
      groupId: rp.participant.groupId || undefined,
      isClosed: rp.participant.isClosed || false,
    })) || [],
    pendingParticipants: receipt.pendingParticipants?.map((pp: any) => ({
      id: pp.id,
      name: pp.name,
      userId: pp.userId,
      requestedAt: pp.requestedAt.toISOString(),
    })) || [],
    items: receipt.receiptItems?.map((item: any) => ({
      id: item.id,
      name: item.name,
      quantity: Number(item.quantity),
      price: Number(item.price),
      participantId: item.participantId,
      addedAt: item.addedAt.toISOString(),
    })) || [],
    deletionRequests: receipt.deletionRequests?.map((dr: any) => ({
      id: dr.id,
      itemId: dr.itemId,
      participantId: dr.participantId,
      requestedAt: dr.requestedAt.toISOString(),
    })) || [],
    serviceChargePercent: Number(receipt.serviceChargePercent) || 0,
    cover: Number(receipt.cover) || 0,
    total: Number(receipt.total) || 0,
    isClosed: receipt.isClosed || false,
    createdAt: receipt.createdAt.toISOString(),
    updatedAt: receipt.updatedAt.toISOString(),
  };
}

/**
 * Verifica se o usuário tem acesso ao recibo (é criador ou participante)
 */
export async function checkReceiptAccess(
  userId: string,
  receiptId: string
): Promise<{ hasAccess: boolean; isCreator: boolean; isParticipant: boolean }> {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      receiptParticipants: {
        include: {
          participant: true,
        },
      },
    },
  });

  if (!receipt) {
    return { hasAccess: false, isCreator: false, isParticipant: false };
  }

  const isCreator = receipt.creatorId === userId;

  const isParticipant = receipt.receiptParticipants.some(
    (rp) => rp.participant.userId === userId && !rp.participant.isClosed
  );

  return {
    hasAccess: isCreator || isParticipant,
    isCreator,
    isParticipant,
  };
}

/**
 * Recalcula e atualiza o total do recibo
 */
export async function recalculateReceiptTotal(receiptId: string): Promise<number> {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      receiptItems: true,
    },
  });

  if (!receipt) {
    throw new Error('Recibo não encontrado');
  }

  // Calcula total dos itens
  const itemsTotal = receipt.receiptItems.reduce((sum, item) => {
    return sum + Number(item.quantity) * Number(item.price);
  }, 0);

  // Calcula total final
  const total = calculateReceiptTotal(
    itemsTotal,
    receipt.serviceChargePercent ? Number(receipt.serviceChargePercent) : null,
    receipt.cover ? Number(receipt.cover) : null
  );

  // Atualiza no banco
  await prisma.receipt.update({
    where: { id: receiptId },
    data: { total },
  });

  return total;
}
