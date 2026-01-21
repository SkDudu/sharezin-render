import { prisma } from '../config/database';

/**
 * Busca o plano ativo do usuário
 */
export async function getUserActivePlan(userId: string) {
  const subscription = await prisma.userSubscription.findFirst({
    where: {
      userId,
      status: 'active',
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: {
      plan: true,
    },
    orderBy: {
      startedAt: 'desc',
    },
  });

  return subscription?.plan || null;
}

/**
 * Verifica se o usuário pode criar mais recibos no mês atual
 */
export async function checkReceiptLimit(userId: string): Promise<{
  canCreate: boolean;
  currentCount: number;
  limit: number | null;
  message?: string;
}> {
  const plan = await getUserActivePlan(userId);

  // Se não tem plano ou limite é null, pode criar ilimitado
  if (!plan || plan.maxReceiptsPerMonth === null) {
    return {
      canCreate: true,
      currentCount: 0,
      limit: null,
    };
  }

  // Conta recibos criados no mês atual
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const currentCount = await prisma.receipt.count({
    where: {
      creatorId: userId,
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
  });

  const canCreate = currentCount < plan.maxReceiptsPerMonth;

  return {
    canCreate,
    currentCount,
    limit: plan.maxReceiptsPerMonth,
    message: canCreate
      ? undefined
      : `Limite de ${plan.maxReceiptsPerMonth} recibos por mês atingido`,
  };
}

/**
 * Verifica se o recibo pode ter mais participantes
 */
export async function checkParticipantLimit(
  receiptId: string,
  plan: any
): Promise<{
  canAdd: boolean;
  currentCount: number;
  limit: number | null;
  message?: string;
}> {
  // Se limite é null, pode adicionar ilimitado
  if (!plan || plan.maxParticipantsPerReceipt === null) {
    return {
      canAdd: true,
      currentCount: 0,
      limit: null,
    };
  }

  // Conta participantes ativos (não fechados)
  const currentCount = await prisma.receiptParticipant.count({
    where: {
      receiptId,
      participant: {
        isClosed: false,
      },
    },
  });

  const canAdd = currentCount < plan.maxParticipantsPerReceipt;

  return {
    canAdd,
    currentCount,
    limit: plan.maxParticipantsPerReceipt,
    message: canAdd
      ? undefined
      : `Limite de ${plan.maxParticipantsPerReceipt} participantes por recibo atingido`,
  };
}

/**
 * Verifica limite de histórico ao listar recibos fechados
 */
export async function checkHistoryLimit(
  userId: string,
  plan: any
): Promise<number | null> {
  // Se não tem plano ou limite é null, retorna null (sem limite)
  if (!plan || plan.maxHistoryReceipts === null) {
    return null;
  }

  return plan.maxHistoryReceipts;
}

/**
 * Obtém limites do plano do usuário
 */
export async function getUserPlanLimits(userId: string) {
  const plan = await getUserActivePlan(userId);

  if (!plan) {
    return {
      maxReceiptsPerMonth: null,
      maxParticipantsPerReceipt: null,
      maxHistoryReceipts: null,
    };
  }

  return {
    maxReceiptsPerMonth: plan.maxReceiptsPerMonth,
    maxParticipantsPerReceipt: plan.maxParticipantsPerReceipt,
    maxHistoryReceipts: plan.maxHistoryReceipts,
  };
}
