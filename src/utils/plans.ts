import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

function decimalToNumber(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'object' && 'toNumber' in v ? (v as Prisma.Decimal).toNumber() : Number(v);
}

export interface PlanLimits {
  maxParticipantsPerReceipt: number | null;
  maxReceiptsPerMonth: number | null;
  maxHistoryReceipts: number | null;
  planId: string | null;
  planName: string;
}

/**
 * Retorna o plano ativo do usuário. Se não houver assinatura ativa, considera plano "free".
 * Limites null = ilimitado.
 */
export async function getUserActivePlan(userId: string): Promise<PlanLimits> {
  const freePlan = await prisma.plan.findUnique({
    where: { name: 'free', isActive: true },
  });

  const now = new Date();
  const activeSubscription = await prisma.userSubscription.findFirst({
    where: {
      userId,
      status: 'active',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: { plan: true },
    orderBy: { startedAt: 'desc' },
  });

  if (activeSubscription?.plan) {
    return {
      maxParticipantsPerReceipt: activeSubscription.plan.maxParticipantsPerReceipt,
      maxReceiptsPerMonth: activeSubscription.plan.maxReceiptsPerMonth,
      maxHistoryReceipts: activeSubscription.plan.maxHistoryReceipts,
      planId: activeSubscription.plan.id,
      planName: activeSubscription.plan.name,
    };
  }

  if (freePlan) {
    return {
      maxParticipantsPerReceipt: freePlan.maxParticipantsPerReceipt,
      maxReceiptsPerMonth: freePlan.maxReceiptsPerMonth,
      maxHistoryReceipts: freePlan.maxHistoryReceipts,
      planId: freePlan.id,
      planName: freePlan.name,
    };
  }

  return {
    maxParticipantsPerReceipt: null,
    maxReceiptsPerMonth: null,
    maxHistoryReceipts: null,
    planId: null,
    planName: 'free',
  };
}

/**
 * Verifica se o usuário pode criar mais um recibo neste mês.
 * Retorna true se pode criar, false se limite atingido.
 */
export async function checkReceiptLimit(userId: string): Promise<boolean> {
  const limits = await getUserActivePlan(userId);
  if (limits.maxReceiptsPerMonth == null) return true;

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const count = await prisma.receipt.count({
    where: {
      creatorId: userId,
      createdAt: { gte: startOfMonth },
    },
  });

  return count < limits.maxReceiptsPerMonth;
}

/**
 * Verifica se o recibo pode ter mais participantes (ao aceitar pendentes).
 * Retorna true se pode aceitar mais.
 */
export async function checkParticipantLimit(receiptId: string, userId: string): Promise<boolean> {
  const limits = await getUserActivePlan(userId);
  if (limits.maxParticipantsPerReceipt == null) return true;

  const count = await prisma.receiptParticipant.count({
    where: { receiptId },
  });

  return count < limits.maxParticipantsPerReceipt;
}

/**
 * Retorna o limite de recibos no histórico (onlyClosed). null = ilimitado.
 */
export async function getHistoryLimit(userId: string): Promise<number | null> {
  const limits = await getUserActivePlan(userId);
  return limits.maxHistoryReceipts;
}
