import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import type { Receipt, Participant, PendingParticipant, ReceiptItem, DeletionRequest } from '../types';

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 8;

/**
 * Gera um código de convite único (6-8 caracteres alfanuméricos).
 */
export async function generateInviteCode(): Promise<string> {
  let code: string;
  let exists: { id: string } | null;
  do {
    code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
      code += INVITE_CODE_CHARS.charAt(Math.floor(Math.random() * INVITE_CODE_CHARS.length));
    }
    exists = await prisma.receipt.findUnique({
      where: { inviteCode: code },
      select: { id: true },
    });
  } while (exists);
  return code;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'object' && 'toNumber' in value
    ? (value as Prisma.Decimal).toNumber()
    : Number(value);
}

/**
 * Formata um recibo do Prisma para o formato da API (camelCase, números, datas ISO).
 */
export function formatReceiptResponse(r: {
  id: string;
  title: string;
  date: Date;
  creatorId: string;
  inviteCode: string;
  serviceChargePercent: Prisma.Decimal | null;
  cover: Prisma.Decimal | null;
  total: Prisma.Decimal | null;
  isClosed: boolean;
  createdAt: Date;
  updatedAt: Date;
  receiptParticipants?: Array<{
    participant: {
      id: string;
      name: string;
      groupId: string | null;
      userId: string | null;
      isClosed: boolean;
    };
  }>;
  receiptItems?: Array<{
    id: string;
    name: string;
    quantity: Prisma.Decimal;
    price: Prisma.Decimal;
    participantId: string;
    addedAt: Date;
  }>;
  pendingParticipants?: Array<{
    id: string;
    name: string;
    requestedAt: Date;
    userId: string;
  }>;
  deletionRequests?: Array<{
    id: string;
    itemId: string;
    participantId: string;
    requestedAt: Date;
  }>;
}): Receipt {
  const participants: Participant[] = (r.receiptParticipants ?? []).map((rp) => ({
    id: rp.participant.id,
    name: rp.participant.name,
    groupId: rp.participant.groupId ?? undefined,
    userId: rp.participant.userId ?? undefined,
    isClosed: rp.participant.isClosed,
  }));

  const items: ReceiptItem[] = (r.receiptItems ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    quantity: decimalToNumber(i.quantity),
    price: decimalToNumber(i.price),
    participantId: i.participantId,
    addedAt: i.addedAt.toISOString(),
  }));

  const pendingParticipants: PendingParticipant[] = (r.pendingParticipants ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    requestedAt: p.requestedAt.toISOString(),
    userId: p.userId,
  }));

  const deletionRequests: DeletionRequest[] = (r.deletionRequests ?? []).map((d) => ({
    id: d.id,
    itemId: d.itemId,
    participantId: d.participantId,
    requestedAt: d.requestedAt.toISOString(),
  }));

  return {
    id: r.id,
    title: r.title,
    date: r.date.toISOString(),
    creatorId: r.creatorId,
    inviteCode: r.inviteCode,
    participants,
    pendingParticipants,
    items,
    deletionRequests,
    serviceChargePercent: decimalToNumber(r.serviceChargePercent),
    cover: decimalToNumber(r.cover),
    total: decimalToNumber(r.total),
    isClosed: r.isClosed,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type ReceiptWithRelations = NonNullable<Awaited<ReturnType<typeof getReceiptById>>>;

/**
 * Verifica se o usuário tem acesso ao recibo (criador ou participante).
 * Retorna o recibo com relações ou null se não encontrado.
 */
export async function checkReceiptAccess(
  receiptId: string,
  userId: string
): Promise<{ receipt: ReceiptWithRelations; isCreator: boolean } | null> {
  const receipt = await getReceiptById(receiptId);
  if (!receipt) return null;
  if (receipt.creatorId === userId) return { receipt, isCreator: true };
  const participantLink = await prisma.receiptParticipant.findFirst({
    where: { receiptId, participant: { userId } },
  });
  if (participantLink) return { receipt, isCreator: false };
  return null;
}

/**
 * Busca recibo por ID com todas as relações necessárias para a API.
 */
export async function getReceiptById(receiptId: string) {
  return prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      receiptParticipants: {
        include: {
          participant: {
            select: { id: true, name: true, groupId: true, userId: true, isClosed: true },
          },
        },
      },
      receiptItems: true,
      pendingParticipants: true,
      deletionRequests: true,
    },
  });
}

/**
 * Calcula o total do recibo: soma dos itens + taxa de serviço proporcional + cover.
 */
export function calculateReceiptTotal(
  itemsTotal: number,
  serviceChargePercent: number,
  cover: number
): number {
  const serviceAmount = (itemsTotal * serviceChargePercent) / 100;
  return itemsTotal + serviceAmount + cover;
}

/**
 * Recalcula e atualiza o total do recibo no banco.
 */
export async function recalculateReceiptTotal(receiptId: string): Promise<void> {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      receiptItems: true,
    },
  });
  if (!receipt) return;

  const itemsTotal = receipt.receiptItems.reduce(
    (sum, i) => sum + decimalToNumber(i.quantity) * decimalToNumber(i.price),
    0
  );
  const serviceChargePercent = decimalToNumber(receipt.serviceChargePercent);
  const cover = decimalToNumber(receipt.cover);
  const total = itemsTotal + (itemsTotal * serviceChargePercent) / 100 + cover;

  await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      total: new Prisma.Decimal(total),
    },
  });
}
