import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import {
  getReceiptById,
  formatReceiptResponse,
  checkReceiptAccess,
  generateInviteCode,
  recalculateReceiptTotal,
} from '../utils/receipts';
import { checkReceiptLimit, getHistoryLimit, getUserActivePlan } from '../utils/plans';
import {
  notifyReceiptClosed,
  notifyItemAdded,
  notifyParticipantRequest,
  notifyCreatorTransferred,
} from '../utils/notifications';
import type {
  CreateReceiptDto,
  UpdateReceiptDto,
  RequestJoinDto,
  TransferCreatorDto,
  ListReceiptsQuery,
  DashboardStatsQuery,
} from '../types';

function decimalToNumber(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'object' && 'toNumber' in v ? (v as Prisma.Decimal).toNumber() : Number(v);
}

export async function receiptRoutes(fastify: FastifyInstance) {
  const receiptInclude = {
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
  } as const;

  // GET /receipts/dashboard-stats — deve vir antes de /:id
  fastify.get<{ Querystring: DashboardStatsQuery }>(
    '/dashboard-stats',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Querystring: DashboardStatsQuery }>, reply: FastifyReply) => {
      try {
        const userId = request.userPayload!.id;
        const year = request.query.year ? parseInt(request.query.year, 10) : new Date().getFullYear();
        if (isNaN(year)) {
          return reply.status(400).send({ error: 'Bad Request', message: 'Ano inválido' });
        }

        const expenses = await prisma.userReceiptExpense.findMany({
          where: { userId, isClosed: true },
          orderBy: { receiptDate: 'asc' },
        });

        const periodMap = new Map<string, { total: number; receiptIds: Set<string> }>();
        const dayMap = new Map<string, { total: number; receiptIds: Set<string> }>();
        const distribution: Array<{
          receiptId: string;
          receiptTitle: string;
          receiptDate: string;
          totalSpent: number;
          isClosed: boolean;
        }> = [];

        for (const e of expenses) {
          const totalSpent = decimalToNumber(e.totalSpent);
          const d = e.receiptDate;
          const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
          if (d.getUTCFullYear() === year) {
            const pp = periodMap.get(period) ?? { total: 0, receiptIds: new Set<string>() };
            pp.total += totalSpent;
            pp.receiptIds.add(e.receiptId);
            periodMap.set(period, pp);

            const pd = dayMap.get(day) ?? { total: 0, receiptIds: new Set<string>() };
            pd.total += totalSpent;
            pd.receiptIds.add(e.receiptId);
            dayMap.set(day, pd);

            distribution.push({
              receiptId: e.receiptId,
              receiptTitle: e.receiptTitle,
              receiptDate: e.receiptDate.toISOString(),
              totalSpent,
              isClosed: e.isClosed,
            });
          }
        }

        const expensesByPeriod = Array.from(periodMap.entries()).map(([period, v]) => ({
          period,
          total: v.total,
          receiptCount: v.receiptIds.size,
        }));

        const expensesByDay = Array.from(dayMap.entries()).map(([day, v]) => ({
          day,
          total: v.total,
          receiptCount: v.receiptIds.size,
        }));

        return reply.send({
          expensesByPeriod,
          expensesByDay,
          expenseDistribution: distribution,
        });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao buscar gastos por período',
        });
      }
    }
  );

  // GET /receipts/invite/:inviteCode — sem auth
  fastify.get<{ Params: { inviteCode: string } }>(
    '/invite/:inviteCode',
    async (request: FastifyRequest<{ Params: { inviteCode: string } }>, reply: FastifyReply) => {
      try {
        const { inviteCode } = request.params;
        const receipt = await prisma.receipt.findUnique({
          where: { inviteCode },
          include: receiptInclude,
        });
        if (!receipt) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Código de convite inválido',
          });
        }
        return reply.send({ receipt: formatReceiptResponse(receipt) });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao processar requisição',
        });
      }
    }
  );

  // GET /receipts — lista
  fastify.get<{ Querystring: ListReceiptsQuery }>(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Querystring: ListReceiptsQuery }>, reply: FastifyReply) => {
      try {
        const userId = request.userPayload!.id;
        const includeClosed = request.query.includeClosed === true || String(request.query.includeClosed) === 'true';
        const onlyClosed = request.query.onlyClosed === true || String(request.query.onlyClosed) === 'true';
        const limit = Math.min(Math.max(parseInt(String(request.query.limit || 100), 10) || 100, 1), 500);
        const offset = Math.max(0, parseInt(String(request.query.offset ?? 0), 10) || 0);

        const where: Prisma.ReceiptWhereInput = {
          OR: [{ creatorId: userId }, { receiptParticipants: { some: { participant: { userId } } } }],
        };

        if (onlyClosed) {
          where.isClosed = true;
        } else if (!includeClosed) {
          where.isClosed = false;
        }

        let take = limit;
        if (onlyClosed) {
          const historyLimit = await getHistoryLimit(userId);
          if (historyLimit != null) take = Math.min(take, historyLimit);
        }

        const [receipts, total] = await Promise.all([
          prisma.receipt.findMany({
            where,
            include: receiptInclude,
            orderBy: { updatedAt: 'desc' },
            skip: offset,
            take,
          }),
          prisma.receipt.count({ where }),
        ]);

        return reply.send({
          receipts: receipts.map((r) => formatReceiptResponse(r)),
          total,
        });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao buscar recibos',
        });
      }
    }
  );

  // POST /receipts — criar
  fastify.post<{ Body: CreateReceiptDto }>(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Body: CreateReceiptDto }>, reply: FastifyReply) => {
      try {
        const userId = request.userPayload!.id;
        const body = request.body;
        if (!body?.title || typeof body.title !== 'string' || !body.title.trim()) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Título é obrigatório',
          });
        }

        const canCreate = await checkReceiptLimit(userId);
        if (!canCreate) {
          return reply.status(403).send({
            error: 'Plan Limit',
            message: 'Limite de recibos atingido',
          });
        }

        const inviteCode = await generateInviteCode();
        const serviceChargePercent = Math.max(0, Number(body.serviceChargePercent) || 0);
        const cover = Math.max(0, Number(body.cover) || 0);

        const creator = await prisma.sharezinUser.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        const creatorName = creator?.name ?? 'Participante';

        if (body.groupId) {
          const group = await prisma.group.findUnique({
            where: { id: body.groupId },
            select: { userId: true },
          });
          if (!group || group.userId !== userId) {
            return reply.status(403).send({
              error: 'Forbidden',
              message: 'Grupo não encontrado ou não pertence a você',
            });
          }
          const groupParticipants = await prisma.participant.findMany({
            where: { groupId: body.groupId },
            select: { id: true },
          });
          const limits = await getUserActivePlan(userId);
          const totalParticipants = 1 + groupParticipants.length;
          if (
            limits.maxParticipantsPerReceipt != null &&
            totalParticipants > limits.maxParticipantsPerReceipt
          ) {
            return reply.status(403).send({
              error: 'Plan Limit',
              message: 'Limite de participantes do plano excedido',
            });
          }
        }

        const receipt = await prisma.$transaction(async (tx) => {
          const rec = await tx.receipt.create({
            data: {
              title: body.title.trim(),
              creatorId: userId,
              inviteCode,
              serviceChargePercent: new Prisma.Decimal(serviceChargePercent),
              cover: new Prisma.Decimal(cover),
            },
          });

          const participant = await tx.participant.create({
            data: {
              name: creatorName,
              userId,
            },
          });

          await tx.receiptParticipant.create({
            data: { receiptId: rec.id, participantId: participant.id },
          });

          if (body.groupId) {
            const groupParticipants = await tx.participant.findMany({
              where: { groupId: body.groupId },
            });
            const totalParticipants = 1 + groupParticipants.length;
            const now = new Date();
            const activeSub = await tx.userSubscription.findFirst({
              where: {
                userId,
                status: 'active',
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
              include: { plan: true },
              orderBy: { startedAt: 'desc' },
            });
            const plan = activeSub?.plan ?? await tx.plan.findUnique({ where: { name: 'free', isActive: true } });
            const max = plan?.maxParticipantsPerReceipt ?? null;
            if (max != null && totalParticipants > max) {
              const e = new Error('Limite de participantes do plano excedido') as Error & { planLimit?: boolean };
              e.planLimit = true;
              throw e;
            }
            for (const gp of groupParticipants) {
              const exists = await tx.receiptParticipant.findUnique({
                where: {
                  receiptId_participantId: { receiptId: rec.id, participantId: gp.id },
                },
              });
              if (!exists) {
                await tx.receiptParticipant.create({
                  data: { receiptId: rec.id, participantId: gp.id },
                });
              }
            }
          }

          return tx.receipt.findUniqueOrThrow({
            where: { id: rec.id },
            include: receiptInclude,
          });
        });

        return reply.status(201).send({ receipt: formatReceiptResponse(receipt) });
      } catch (err) {
        const planLimit = (err as Error & { planLimit?: boolean })?.planLimit;
        if (planLimit) {
          return reply.status(403).send({
            error: 'Plan Limit',
            message: (err as Error).message,
          });
        }
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao criar recibo',
        });
      }
    }
  );

  // GET /receipts/:id
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const userId = request.userPayload!.id;
        const { id } = request.params;
        const access = await checkReceiptAccess(id, userId);
        if (!access) {
          const exists = await getReceiptById(id);
          return reply.status(exists ? 403 : 404).send({
            error: exists ? 'Forbidden' : 'Not Found',
            message: exists ? 'Sem permissão para acessar este recibo' : 'Recibo não encontrado',
          });
        }
        return reply.send({ receipt: formatReceiptResponse(access.receipt) });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao processar requisição',
        });
      }
    }
  );

  // PUT /receipts/:id
  fastify.put<{ Params: { id: string }; Body: UpdateReceiptDto }>(
    '/:id',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateReceiptDto }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.userPayload!.id;
        const { id } = request.params;
        const body = request.body ?? {};

        const access = await checkReceiptAccess(id, userId);
        if (!access) {
          const exists = await getReceiptById(id);
          return reply.status(exists ? 403 : 404).send({
            error: exists ? 'Forbidden' : 'Not Found',
            message: exists ? 'Sem permissão para atualizar este recibo' : 'Recibo não encontrado',
          });
        }

        const { receipt, isCreator } = access;
        const rec = receipt;
        if (rec.isClosed && body.items?.length) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Não é possível adicionar produtos a um recibo fechado',
          });
        }

        const updateData: Prisma.ReceiptUpdateInput = {};
        if (isCreator) {
          if (body.title !== undefined) {
            const trimmedTitle = String(body.title).trim();
            if (!trimmedTitle) {
              return reply.status(400).send({
                error: 'Bad Request',
                message: 'Título não pode ser vazio',
              });
            }
            updateData.title = trimmedTitle;
          }
          if (body.serviceChargePercent !== undefined)
            updateData.serviceChargePercent = new Prisma.Decimal(Math.max(0, Number(body.serviceChargePercent) || 0));
          if (body.cover !== undefined)
            updateData.cover = new Prisma.Decimal(Math.max(0, Number(body.cover) || 0));
          if (body.isClosed !== undefined) {
            const requestedClosed = Boolean(body.isClosed);
            if (rec.isClosed && !requestedClosed) {
              return reply.status(400).send({
                error: 'Bad Request',
                message: 'Não é possível reabrir um recibo já fechado',
              });
            }
            updateData.isClosed = requestedClosed;
          }
        }

        const newItems = Array.isArray(body.items) ? body.items : [];
        const participantUserIds = await getParticipantUserIds(id);

        const myParticipantId =
          !isCreator && newItems.length > 0
            ? rec.receiptParticipants?.find((rp) => rp.participant.userId === userId)?.participant.id
            : null;

        type ValidItem = { name: string; quantity: number; price: number; participantId: string };
        const validItems: ValidItem[] = [];
        for (const it of newItems) {
          const name = it.name && String(it.name).trim();
          const quantity = Math.max(0, Number(it.quantity) || 1);
          const price = Math.max(0, Number(it.price) || 0);
          const participantId = it.participantId;
          if (!name || !participantId) continue;
          validItems.push({ name, quantity, price, participantId });
        }

        if (!isCreator && validItems.length > 0) {
          if (!myParticipantId || validItems.some((it) => it.participantId !== myParticipantId)) {
            return reply.status(403).send({
              error: 'Forbidden',
              message: 'Participante só pode adicionar itens para a própria participação',
            });
          }
        }

        if (validItems.length) {
          for (const it of validItems) {
            const link = await prisma.receiptParticipant.findUnique({
              where: {
                receiptId_participantId: { receiptId: id, participantId: it.participantId },
              },
              include: { participant: { select: { isClosed: true } } },
            });
            if (!link || link.participant.isClosed) continue;

            await prisma.receiptItem.create({
              data: {
                receiptId: id,
                name: it.name,
                quantity: new Prisma.Decimal(it.quantity),
                price: new Prisma.Decimal(it.price),
                participantId: it.participantId,
              },
            });
            await notifyItemAdded({
              receiptId: id,
              receiptTitle: rec.title,
              itemName: it.name,
              addedByUserId: userId,
              participantUserIds,
            });
          }
          await recalculateReceiptTotal(id);
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.receipt.update({
            where: { id },
            data: updateData,
          });
        }

        const updated = await getReceiptById(id);
        if (!updated) {
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Erro ao atualizar recibo',
          });
        }
        return reply.send({ receipt: formatReceiptResponse(updated) });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao atualizar recibo',
        });
      }
    }
  );

  // DELETE /receipts/:id
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const userId = request.userPayload!.id;
        const { id } = request.params;
        const receipt = await getReceiptById(id);
        if (!receipt) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Recibo não encontrado',
          });
        }
        if (receipt.creatorId !== userId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Apenas o criador pode excluir o recibo',
          });
        }
        await prisma.receipt.delete({ where: { id } });
        return reply.status(204).send();
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao excluir recibo',
        });
      }
    }
  );

  // POST /receipts/:id/close
  fastify.post<{ Params: { id: string } }>(
    '/:id/close',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const userId = request.userPayload!.id;
        const { id } = request.params;
        const receipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: { include: { participant: true } },
            receiptItems: true,
            creator: { select: { id: true } },
          },
        });
        if (!receipt) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Recibo não encontrado',
          });
        }
        if (receipt.creatorId !== userId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Apenas o criador pode fechar o recibo',
          });
        }
        if (receipt.isClosed) {
          const full = await getReceiptById(id);
          return reply.send({ receipt: formatReceiptResponse(full!) });
        }

        const servicePercent = decimalToNumber(receipt.serviceChargePercent);
        const cover = decimalToNumber(receipt.cover);
        const itemsTotalAll = receipt.receiptItems.reduce(
          (s, i) => s + decimalToNumber(i.quantity) * decimalToNumber(i.price),
          0
        );
        const serviceTotal = (itemsTotalAll * servicePercent) / 100;
        const participantsWithUserId = receipt.receiptParticipants.filter((rp) => rp.participant.userId);
        const nCover = Math.max(participantsWithUserId.length, 1);
        const coverPerPerson = cover / nCover;

        const participantUserIds: string[] = participantsWithUserId.map((rp) => rp.participant.userId!);

        await prisma.$transaction(async (tx) => {
          for (const rp of receipt.receiptParticipants) {
            const pitems = receipt.receiptItems.filter((i) => i.participantId === rp.participantId);
            const itemsTotal = pitems.reduce(
              (s, i) => s + decimalToNumber(i.quantity) * decimalToNumber(i.price),
              0
            );
            const serviceAmount = itemsTotalAll > 0 ? (itemsTotal / itemsTotalAll) * serviceTotal : 0;
            const totalSpent = itemsTotal + serviceAmount + coverPerPerson;
            const recDate = receipt.date;
            const periodMonth = `${recDate.getUTCFullYear()}-${String(recDate.getUTCMonth() + 1).padStart(2, '0')}`;
            const periodDay = `${recDate.getUTCFullYear()}-${String(recDate.getUTCMonth() + 1).padStart(2, '0')}-${String(recDate.getUTCDate()).padStart(2, '0')}`;

            if (rp.participant.userId) {
              await tx.userReceiptExpense.create({
                data: {
                  userId: rp.participant.userId,
                  receiptId: id,
                  participantId: rp.participantId,
                  itemsTotal: new Prisma.Decimal(itemsTotal),
                  serviceChargeAmount: new Prisma.Decimal(serviceAmount),
                  coverAmount: new Prisma.Decimal(coverPerPerson),
                  totalSpent: new Prisma.Decimal(totalSpent),
                  receiptDate: receipt.date,
                  receiptTitle: receipt.title,
                  isClosed: true,
                  periodMonth,
                  periodDay,
                },
              });
            }
          }
          await tx.receipt.update({
            where: { id },
            data: { isClosed: true },
          });
        });

        await recalculateReceiptTotal(id);
        await notifyReceiptClosed({
          receiptId: id,
          receiptTitle: receipt.title,
          creatorId: receipt.creatorId,
          participantUserIds,
        });

        const full = await getReceiptById(id);
        return reply.send({ receipt: formatReceiptResponse(full!) });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao fechar recibo',
        });
      }
    }
  );

  // POST /receipts/:id/request-join
  fastify.post<{ Params: { id: string }; Body: RequestJoinDto }>(
    '/:id/request-join',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: RequestJoinDto }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.userPayload!.id;
        const { id } = request.params;
        const name = request.body?.name?.trim();
        const receipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: { include: { participant: { select: { userId: true } } } },
            pendingParticipants: { where: { userId } },
          },
        });
        if (!receipt) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Recibo não encontrado',
          });
        }
        if (receipt.isClosed) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Não é possível solicitar entrada em um recibo fechado',
          });
        }
        if (receipt.creatorId === userId) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Você é o responsável por este recibo',
          });
        }
        const alreadyParticipant = receipt.receiptParticipants.some(
          (rp) => rp.participant.userId === userId
        );
        if (alreadyParticipant) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Você já é participante deste recibo',
          });
        }
        const alreadyPending = receipt.pendingParticipants.length > 0;
        if (alreadyPending) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Você já solicitou entrada neste recibo',
          });
        }

        const user = await prisma.sharezinUser.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        const displayName = name || user?.name || 'Usuário';

        const pending = await prisma.pendingParticipant.create({
          data: {
            receiptId: id,
            name: displayName,
            userId,
          },
        });

        await notifyParticipantRequest({
          receiptId: id,
          receiptTitle: receipt.title,
          creatorUserId: receipt.creatorId,
          requesterName: displayName,
          requesterUserId: userId,
        });

        return reply.status(201).send({
          message: 'Solicitação de entrada enviada com sucesso',
          pendingParticipant: {
            id: pending.id,
            name: pending.name,
            requestedAt: pending.requestedAt.toISOString(),
            userId: pending.userId,
          },
        });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao criar solicitação de entrada',
        });
      }
    }
  );

  // PUT /receipts/:id/transfer-creator
  fastify.put<{ Params: { id: string }; Body: TransferCreatorDto }>(
    '/:id/transfer-creator',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: TransferCreatorDto }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.userPayload!.id;
        const { id } = request.params;
        const newCreatorParticipantId = request.body?.newCreatorParticipantId;
        if (!newCreatorParticipantId) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'ID do novo criador é obrigatório',
          });
        }

        const receipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: { include: { participant: true } },
          },
        });
        if (!receipt) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Recibo não encontrado',
          });
        }
        if (receipt.creatorId !== userId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Apenas o criador atual pode transferir a responsabilidade',
          });
        }
        if (receipt.isClosed) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Não é possível transferir criador de um recibo fechado',
          });
        }

        const rp = receipt.receiptParticipants.find(
          (r) => r.participantId === newCreatorParticipantId
        );
        if (!rp) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'O novo criador deve ser um participante do recibo',
          });
        }
        if (rp.participant.userId === userId) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Não é possível transferir para si mesmo',
          });
        }
        if (rp.participant.isClosed) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Não é possível transferir para um participante que fechou sua participação',
          });
        }
        const newCreatorUserId = rp.participant.userId;
        if (!newCreatorUserId) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Novo criador não encontrado',
          });
        }

        await prisma.receipt.update({
          where: { id },
          data: { creatorId: newCreatorUserId },
        });

        await notifyCreatorTransferred({
          receiptId: id,
          receiptTitle: receipt.title,
          newCreatorUserId,
          previousCreatorUserId: userId,
        });

        const full = await getReceiptById(id);
        return reply.send({ receipt: formatReceiptResponse(full!) });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao transferir criador',
        });
      }
    }
  );

  // GET /receipts/:id/participants/user-ids — antes das rotas com :participantId para não ser confundido com segmento literal
  fastify.get<{ Params: { id: string } }>(
    '/:id/participants/user-ids',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const userId = request.userPayload!.id;
        const { id } = request.params;
        const access = await checkReceiptAccess(id, userId);
        if (!access) {
          const exists = await getReceiptById(id);
          return reply.status(exists ? 403 : 404).send({
            error: exists ? 'Forbidden' : 'Not Found',
            message: exists ? 'Sem permissão para acessar este recibo' : 'Recibo não encontrado',
          });
        }
        const userIds = await getParticipantUserIds(id);
        return reply.send({ userIds });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao processar requisição',
        });
      }
    }
  );

  // DELETE /receipts/:id/participants/:participantId
  fastify.delete<{ Params: { id: string; participantId: string } }>(
    '/:id/participants/:participantId',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { id: string; participantId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.userPayload!.id;
        const { id, participantId } = request.params;
        const receipt = await getReceiptById(id);
        if (!receipt) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Recibo não encontrado',
          });
        }
        if (receipt.creatorId !== userId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Apenas o criador pode remover participantes',
          });
        }
        if (receipt.isClosed) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Não é possível remover participante de um recibo fechado',
          });
        }
        const link = await prisma.receiptParticipant.findUnique({
          where: {
            receiptId_participantId: { receiptId: id, participantId },
          },
          include: { participant: { select: { userId: true } } },
        });
        if (!link) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Participante não encontrado neste recibo',
          });
        }
        if (link.participant.userId === userId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Não é possível remover a própria participação como criador',
          });
        }
        await prisma.$transaction([
          prisma.receiptItem.deleteMany({
            where: { receiptId: id, participantId },
          }),
          prisma.receiptParticipant.delete({
            where: {
              receiptId_participantId: { receiptId: id, participantId },
            },
          }),
        ]);
        await recalculateReceiptTotal(id);
        const updated = await getReceiptById(id);
        return reply.send({ receipt: formatReceiptResponse(updated!) });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao remover participante',
        });
      }
    }
  );

  // POST /receipts/:id/participants/:participantId/close
  fastify.post<{ Params: { id: string; participantId: string } }>(
    '/:id/participants/:participantId/close',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { id: string; participantId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.userPayload!.id;
        const { id, participantId } = request.params;
        const receipt = await getReceiptById(id);
        if (!receipt) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Recibo não encontrado',
          });
        }
        if (receipt.isClosed) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Não é possível fechar participações em um recibo fechado',
          });
        }
        const link = await prisma.receiptParticipant.findUnique({
          where: {
            receiptId_participantId: { receiptId: id, participantId },
          },
          include: { participant: { select: { userId: true } } },
        });
        if (!link) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Participante não encontrado neste recibo',
          });
        }
        const isCreator = receipt.creatorId === userId;
        const isSelf = link.participant.userId === userId;
        if (!isCreator && !isSelf) {
          return reply.status(403).send({
            error: 'Forbidden',
            message:
              'Apenas o criador pode fechar participações de outros, ou você pode fechar a sua própria participação.',
          });
        }
        await prisma.participant.update({
          where: { id: participantId },
          data: { isClosed: true },
        });
        const updated = await getReceiptById(id);
        return reply.send({ receipt: formatReceiptResponse(updated!) });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Erro ao fechar participação',
        });
      }
    }
  );
}

async function getParticipantUserIds(receiptId: string): Promise<string[]> {
  const rows = await prisma.receiptParticipant.findMany({
    where: { receiptId },
    include: { participant: { select: { userId: true } } },
  });
  const ids: string[] = [];
  for (const r of rows) {
    if (r.participant.userId) ids.push(r.participant.userId);
  }
  return ids;
}
