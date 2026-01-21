import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import {
  generateInviteCode,
  formatReceiptResponse,
  checkReceiptAccess,
  recalculateReceiptTotal,
  calculateReceiptTotal,
} from '../utils/receipts';
import { checkReceiptLimit, getUserActivePlan, checkHistoryLimit, checkParticipantLimit } from '../utils/plans';
import {
  notifyReceiptClosed,
  notifyItemAdded,
  notifyParticipantRequest,
  notifyCreatorTransferred,
} from '../utils/notifications';
import {
  checkIsCreator,
  checkIsParticipant,
  checkReceiptNotClosed,
  checkIsCreatorAndNotClosed,
} from '../middleware/receipt-permissions';
import {
  CreateReceiptDto,
  UpdateReceiptDto,
  RequestJoinDto,
  TransferCreatorDto,
} from '../types';

export async function receiptRoutes(fastify: FastifyInstance) {
  // GET /api/receipts - Listar recibos
  fastify.get<{
    Querystring: {
      includeClosed?: string;
      onlyClosed?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!request.userPayload) {
          return reply.status(401).send({
            error: {
              message: 'Não autenticado',
              statusCode: 401,
            },
          });
        }

        const userId = request.userPayload.id;
        const query = request.query as { includeClosed?: string; onlyClosed?: string; limit?: string; offset?: string };
        const includeClosed = query.includeClosed === 'true';
        const onlyClosed = query.onlyClosed === 'true';
        const limit = parseInt(query.limit || '100', 10);
        const offset = parseInt(query.offset || '0', 10);

        // Busca plano para verificar limite de histórico
        const plan = await getUserActivePlan(userId);
        const historyLimit = await checkHistoryLimit(userId, plan);

        // Busca recibos onde o usuário é criador ou participante
        const receipts = await prisma.receipt.findMany({
          where: {
            OR: [
              { creatorId: userId },
              {
                receiptParticipants: {
                  some: {
                    participant: {
                      userId: userId,
                    },
                  },
                },
              },
            ],
            ...(onlyClosed
              ? { isClosed: true }
              : includeClosed
              ? {}
              : { isClosed: false }),
          },
          include: {
            receiptParticipants: {
              include: {
                participant: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            receiptItems: true,
            pendingParticipants: {
              include: {
                user: true,
              },
            },
            deletionRequests: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: onlyClosed && historyLimit ? Math.min(limit, historyLimit) : limit,
          skip: offset,
        });

        const total = await prisma.receipt.count({
          where: {
            OR: [
              { creatorId: userId },
              {
                receiptParticipants: {
                  some: {
                    participant: {
                      userId: userId,
                    },
                  },
                },
              },
            ],
            ...(onlyClosed
              ? { isClosed: true }
              : includeClosed
              ? {}
              : { isClosed: false }),
          },
        });

        return reply.send({
          receipts: receipts.map(formatReceiptResponse),
          total,
        });
      } catch (error) {
        console.error('Error fetching receipts:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao buscar recibos',
            statusCode: 500,
          },
        });
      }
    }
  );

  // GET /api/receipts/:id - Buscar recibo por ID
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        if (!request.userPayload) {
          return reply.status(401).send({
            error: {
              message: 'Não autenticado',
              statusCode: 401,
            },
          });
        }

        const { id } = request.params;
        const userId = request.userPayload.id;

        // Verifica acesso
        const access = await checkReceiptAccess(userId, id);
        if (!access.hasAccess) {
          return reply.status(403).send({
            error: {
              message: 'Sem permissão para acessar este recibo',
              statusCode: 403,
            },
          });
        }

        // Busca recibo completo
        const receipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: {
              include: {
                participant: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            receiptItems: true,
            pendingParticipants: {
              include: {
                user: true,
              },
            },
            deletionRequests: true,
          },
        });

        if (!receipt) {
          return reply.status(404).send({
            error: {
              message: 'Recibo não encontrado',
              statusCode: 404,
            },
          });
        }

        return reply.send({
          receipt: formatReceiptResponse(receipt),
        });
      } catch (error) {
        console.error('Error fetching receipt:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao processar requisição',
            statusCode: 500,
          },
        });
      }
    }
  );

  // GET /api/receipts/invite/:inviteCode - Buscar recibo por código de convite
  fastify.get<{ Params: { inviteCode: string } }>(
    '/invite/:inviteCode',
    async (
      request: FastifyRequest<{ Params: { inviteCode: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { inviteCode } = request.params;

        const receipt = await prisma.receipt.findUnique({
          where: { inviteCode },
          include: {
            receiptParticipants: {
              include: {
                participant: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            receiptItems: true,
            pendingParticipants: {
              include: {
                user: true,
              },
            },
            deletionRequests: true,
          },
        });

        if (!receipt) {
          return reply.status(404).send({
            error: {
              message: 'Código de convite inválido',
              statusCode: 404,
            },
          });
        }

        return reply.send({
          receipt: formatReceiptResponse(receipt),
        });
      } catch (error) {
        console.error('Error fetching receipt by invite code:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao processar requisição',
            statusCode: 500,
          },
        });
      }
    }
  );

  // POST /api/receipts - Criar recibo
  fastify.post<{ Body: CreateReceiptDto }>(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Body: CreateReceiptDto }>, reply: FastifyReply) => {
      try {
        if (!request.userPayload) {
          return reply.status(401).send({
            error: {
              message: 'Não autenticado',
              statusCode: 401,
            },
          });
        }

        const userId = request.userPayload.id;
        const { title, serviceChargePercent, cover, groupId } = request.body;

        // Valida título
        if (!title || title.trim() === '') {
          return reply.status(400).send({
            error: {
              message: 'Título é obrigatório',
              statusCode: 400,
            },
          });
        }

        // Verifica limite de recibos
        const limitCheck = await checkReceiptLimit(userId);
        if (!limitCheck.canCreate) {
          return reply.status(403).send({
            error: {
              message: limitCheck.message || 'Limite de recibos atingido',
              statusCode: 403,
            },
          });
        }

        // Gera invite code único
        const inviteCode = await generateInviteCode();

        // Cria recibo e participante em transação
        const result = await prisma.$transaction(async (tx) => {
          // Cria recibo
          const receipt = await tx.receipt.create({
            data: {
              title: title.trim(),
              creatorId: userId,
              inviteCode,
              serviceChargePercent: serviceChargePercent || 0,
              cover: cover || 0,
              total: 0,
              isClosed: false,
            },
          });

          // Busca ou cria participante para o criador
          let creatorParticipant = await tx.participant.findFirst({
            where: {
              userId: userId,
              groupId: groupId || null,
            },
          });

          if (!creatorParticipant) {
            const user = await tx.sharezinUser.findUnique({
              where: { id: userId },
            });

            creatorParticipant = await tx.participant.create({
              data: {
                name: user?.name || user?.email || 'Participante',
                userId: userId,
                groupId: groupId || null,
                isClosed: false,
              },
            });
          }

          // Adiciona criador como participante do recibo
          await tx.receiptParticipant.create({
            data: {
              receiptId: receipt.id,
              participantId: creatorParticipant.id,
            },
          });

          // Se grupo fornecido, adiciona participantes do grupo
          if (groupId) {
            const groupParticipants = await tx.participant.findMany({
              where: {
                groupId: groupId,
                userId: { not: userId }, // Exclui o criador que já foi adicionado
                isClosed: false,
              },
            });

            for (const participant of groupParticipants) {
              await tx.receiptParticipant.create({
                data: {
                  receiptId: receipt.id,
                  participantId: participant.id,
                },
              });
            }
          }

          // Busca recibo completo para retornar
          return await tx.receipt.findUnique({
            where: { id: receipt.id },
            include: {
              receiptParticipants: {
                include: {
                  participant: {
                    include: {
                      user: true,
                    },
                  },
                },
              },
              receiptItems: true,
              pendingParticipants: {
                include: {
                  user: true,
                },
              },
              deletionRequests: true,
            },
          });
        });

        if (!result) {
          throw new Error('Erro ao criar recibo');
        }

        return reply.status(201).send({
          receipt: formatReceiptResponse(result),
        });
      } catch (error) {
        console.error('Error creating receipt:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao criar recibo',
            statusCode: 500,
          },
        });
      }
    }
  );

  // PUT /api/receipts/:id - Atualizar recibo
  fastify.put<{ Params: { id: string }; Body: UpdateReceiptDto }>(
    '/:id',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateReceiptDto }>,
      reply: FastifyReply
    ) => {
      try {
        if (!request.userPayload) {
          return reply.status(401).send({
            error: {
              message: 'Não autenticado',
              statusCode: 401,
            },
          });
        }

        const { id } = request.params;
        const userId = request.userPayload.id;
        const body = request.body;

        // Verifica acesso e permissões
        const access = await checkReceiptAccess(userId, id);
        if (!access.hasAccess) {
          return reply.status(404).send({
            error: {
              message: 'Recibo não encontrado',
              statusCode: 404,
            },
          });
        }

        const receipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptItems: true,
            receiptParticipants: {
              include: {
                participant: true,
              },
            },
          },
        });

        if (!receipt) {
          return reply.status(404).send({
            error: {
              message: 'Recibo não encontrado',
              statusCode: 404,
            },
          });
        }

        // Se recibo está fechado, não permite adicionar itens
        if (receipt.isClosed && body.items && body.items.length > 0) {
          return reply.status(403).send({
            error: {
              message: 'Não é possível adicionar produtos a um recibo fechado',
              statusCode: 403,
            },
          });
        }

        // Criador pode modificar campos do recibo
        const updateData: any = {};
        if (access.isCreator) {
          if (body.title !== undefined) updateData.title = body.title.trim();
          if (body.serviceChargePercent !== undefined)
            updateData.serviceChargePercent = body.serviceChargePercent;
          if (body.cover !== undefined) updateData.cover = body.cover;
          if (body.isClosed !== undefined) updateData.isClosed = body.isClosed;
        }

        // Participantes podem apenas adicionar itens
        if (body.items && body.items.length > 0) {
          if (receipt.isClosed) {
            return reply.status(403).send({
              error: {
                message: 'Não é possível adicionar produtos a um recibo fechado',
                statusCode: 403,
              },
            });
          }

          // Verifica limite de participantes ao aceitar pendentes
          if (body.pendingParticipants && body.pendingParticipants.length > 0) {
            const plan = await getUserActivePlan(userId);
            const participantLimit = await checkParticipantLimit(id, plan);
            if (!participantLimit.canAdd) {
              return reply.status(403).send({
                error: {
                  message: participantLimit.message || 'Limite de participantes atingido',
                  statusCode: 403,
                },
              });
            }
          }

          // Adiciona novos itens
          for (const item of body.items) {
            // Verifica se participante existe
            const participant = await prisma.participant.findUnique({
              where: { id: item.participantId },
            });

            if (!participant) {
              return reply.status(400).send({
                error: {
                  message: `Participante ${item.participantId} não encontrado`,
                  statusCode: 400,
                },
              });
            }

            await prisma.receiptItem.create({
              data: {
                receiptId: id,
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                participantId: item.participantId,
              },
            });

            // Notifica outros participantes (assíncrono)
            notifyItemAdded(id, item.participantId, userId).catch(console.error);
          }
        }

        // Atualiza recibo se houver mudanças
        if (Object.keys(updateData).length > 0) {
          await prisma.receipt.update({
            where: { id },
            data: updateData,
          });
        }

        // Recalcula total
        await recalculateReceiptTotal(id);

        // Busca recibo atualizado
        const updatedReceipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: {
              include: {
                participant: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            receiptItems: true,
            pendingParticipants: {
              include: {
                user: true,
              },
            },
            deletionRequests: true,
          },
        });

        if (!updatedReceipt) {
          throw new Error('Erro ao buscar recibo atualizado');
        }

        return reply.send({
          receipt: formatReceiptResponse(updatedReceipt),
        });
      } catch (error) {
        console.error('Error updating receipt:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao atualizar recibo',
            statusCode: 500,
          },
        });
      }
    }
  );

  // DELETE /api/receipts/:id - Deletar recibo
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [authenticate, checkIsCreator] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        await prisma.receipt.delete({
          where: { id },
        });

        return reply.status(204).send();
      } catch (error) {
        console.error('Error deleting receipt:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao excluir recibo',
            statusCode: 500,
          },
        });
      }
    }
  );

  // POST /api/receipts/:id/close - Fechar recibo
  fastify.post<{ Params: { id: string } }>(
    '/:id/close',
    { preHandler: [authenticate, checkIsCreator] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const userId = request.userPayload?.id;

        if (!userId) {
          return reply.status(401).send({
            error: {
              message: 'Não autenticado',
              statusCode: 401,
            },
          });
        }

        // Busca recibo com todos os dados necessários
        const receipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptItems: true,
            receiptParticipants: {
              include: {
                participant: true,
              },
            },
          },
        });

        if (!receipt) {
          return reply.status(404).send({
            error: {
              message: 'Recibo não encontrado',
              statusCode: 404,
            },
          });
        }

        // Recalcula total final
        const itemsTotal = receipt.receiptItems.reduce(
          (sum, item) => sum + Number(item.quantity) * Number(item.price),
          0
        );
        const total = calculateReceiptTotal(
          itemsTotal,
          receipt.serviceChargePercent ? Number(receipt.serviceChargePercent) : null,
          receipt.cover ? Number(receipt.cover) : null
        );

        // Fecha recibo e cria registros de despesas em transação
        const updatedReceipt = await prisma.$transaction(async (tx) => {
          // Atualiza recibo
          const updated = await tx.receipt.update({
            where: { id },
            data: {
              isClosed: true,
              total,
            },
          });

          // Cria registros em user_receipt_expenses para cada participante
          for (const rp of receipt.receiptParticipants) {
            if (rp.participant.userId && !rp.participant.isClosed) {
              // Calcula total gasto pelo participante
              const participantItems = receipt.receiptItems.filter(
                (item) => item.participantId === rp.participant.id
              );
              const itemsTotal = participantItems.reduce(
                (sum, item) => sum + Number(item.quantity) * Number(item.price),
                0
              );
              const serviceChargeAmount =
                (itemsTotal * Number(receipt.serviceChargePercent || 0)) / 100;
              const coverAmount = Number(receipt.cover || 0);
              const totalSpent = itemsTotal + serviceChargeAmount + coverAmount;

              // Calcula período
              const receiptDate = receipt.date;
              const periodMonth = `${receiptDate.getFullYear()}-${String(receiptDate.getMonth() + 1).padStart(2, '0')}`;
              const periodDay = `${receiptDate.getFullYear()}-${String(receiptDate.getMonth() + 1).padStart(2, '0')}-${String(receiptDate.getDate()).padStart(2, '0')}`;

              await tx.userReceiptExpense.create({
                data: {
                  userId: rp.participant.userId,
                  receiptId: id,
                  participantId: rp.participant.id,
                  itemsTotal,
                  serviceChargeAmount,
                  coverAmount,
                  totalSpent,
                  receiptDate: receipt.date,
                  receiptTitle: receipt.title,
                  isClosed: true,
                  periodMonth,
                  periodDay,
                },
              });
            }
          }

          return updated;
        });

        // Notifica participantes (assíncrono)
        notifyReceiptClosed(id, userId).catch(console.error);

        // Busca recibo completo para retornar
        const receiptWithRelations = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: {
              include: {
                participant: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            receiptItems: true,
            pendingParticipants: {
              include: {
                user: true,
              },
            },
            deletionRequests: true,
          },
        });

        if (!receiptWithRelations) {
          throw new Error('Erro ao buscar recibo');
        }

        return reply.send({
          receipt: formatReceiptResponse(receiptWithRelations),
        });
      } catch (error) {
        console.error('Error closing receipt:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao fechar recibo',
            statusCode: 500,
          },
        });
      }
    }
  );

  // POST /api/receipts/:id/request-join - Solicitar entrada em recibo
  fastify.post<{ Params: { id: string }; Body: RequestJoinDto }>(
    '/:id/request-join',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: RequestJoinDto }>,
      reply: FastifyReply
    ) => {
      try {
        if (!request.userPayload) {
          return reply.status(401).send({
            error: {
              message: 'Não autenticado',
              statusCode: 401,
            },
          });
        }

        const { id } = request.params;
        const userId = request.userPayload.id;
        const { name } = request.body;

        // Busca recibo
        const receipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: {
              include: {
                participant: true,
              },
            },
            pendingParticipants: true,
          },
        });

        if (!receipt) {
          return reply.status(404).send({
            error: {
              message: 'Recibo não encontrado',
              statusCode: 404,
            },
          });
        }

        // Validações
        if (receipt.isClosed) {
          return reply.status(400).send({
            error: {
              message: 'Não é possível solicitar entrada em um recibo fechado',
              statusCode: 400,
            },
          });
        }

        if (receipt.creatorId === userId) {
          return reply.status(400).send({
            error: {
              message: 'Você é o responsável por este recibo',
              statusCode: 400,
            },
          });
        }

        // Verifica se já é participante
        const isParticipant = receipt.receiptParticipants.some(
          (rp) => rp.participant.userId === userId && !rp.participant.isClosed
        );

        if (isParticipant) {
          return reply.status(400).send({
            error: {
              message: 'Você já é participante deste recibo',
              statusCode: 400,
            },
          });
        }

        // Verifica se já tem solicitação pendente
        const hasPendingRequest = receipt.pendingParticipants.some(
          (pp) => pp.userId === userId
        );

        if (hasPendingRequest) {
          return reply.status(400).send({
            error: {
              message: 'Você já solicitou entrada neste recibo',
              statusCode: 400,
            },
          });
        }

        // Busca nome do usuário
        const user = await prisma.sharezinUser.findUnique({
          where: { id: userId },
        });

        // Cria solicitação pendente
        const pendingParticipant = await prisma.pendingParticipant.create({
          data: {
            receiptId: id,
            userId: userId,
            name: name || user?.name || user?.email || 'Participante',
          },
        });

        // Notifica criador (assíncrono)
        notifyParticipantRequest(id, userId, receipt.creatorId).catch(console.error);

        return reply.status(201).send({
          message: 'Solicitação de entrada enviada com sucesso',
          pendingParticipant: {
            id: pendingParticipant.id,
            name: pendingParticipant.name,
            userId: pendingParticipant.userId,
            requestedAt: pendingParticipant.requestedAt.toISOString(),
          },
        });
      } catch (error) {
        console.error('Error creating join request:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao criar solicitação de entrada',
            statusCode: 500,
          },
        });
      }
    }
  );

  // PUT /api/receipts/:id/transfer-creator - Transferir criador
  fastify.put<{ Params: { id: string }; Body: TransferCreatorDto }>(
    '/:id/transfer-creator',
    { preHandler: [authenticate, checkIsCreatorAndNotClosed] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: TransferCreatorDto }>,
      reply: FastifyReply
    ) => {
      try {
        if (!request.userPayload) {
          return reply.status(401).send({
            error: {
              message: 'Não autenticado',
              statusCode: 401,
            },
          });
        }

        const { id } = request.params;
        const userId = request.userPayload.id;
        const { newCreatorParticipantId } = request.body;

        if (!newCreatorParticipantId) {
          return reply.status(400).send({
            error: {
              message: 'ID do novo criador é obrigatório',
              statusCode: 400,
            },
          });
        }

        // Busca recibo
        const receipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: {
              include: {
                participant: true,
              },
            },
          },
        });

        if (!receipt) {
          return reply.status(404).send({
            error: {
              message: 'Recibo não encontrado',
              statusCode: 404,
            },
          });
        }

        if (receipt.isClosed) {
          return reply.status(400).send({
            error: {
              message: 'Não é possível transferir criador de um recibo fechado',
              statusCode: 400,
            },
          });
        }

        // Busca novo criador (participante)
        const newCreatorParticipant = await prisma.participant.findUnique({
          where: { id: newCreatorParticipantId },
        });

        if (!newCreatorParticipant || !newCreatorParticipant.userId) {
          return reply.status(400).send({
            error: {
              message: 'Novo criador não encontrado',
              statusCode: 400,
            },
          });
        }

        if (newCreatorParticipant.userId === userId) {
          return reply.status(400).send({
            error: {
              message: 'Não é possível transferir para si mesmo',
              statusCode: 400,
            },
          });
        }

        // Verifica se é participante do recibo
        const isParticipant = receipt.receiptParticipants.some(
          (rp) => rp.participantId === newCreatorParticipantId
        );

        if (!isParticipant) {
          return reply.status(400).send({
            error: {
              message: 'O novo criador deve ser um participante do recibo',
              statusCode: 400,
            },
          });
        }

        if (newCreatorParticipant.isClosed) {
          return reply.status(400).send({
            error: {
              message: 'Não é possível transferir para um participante que fechou sua participação',
              statusCode: 400,
            },
          });
        }

        // Atualiza criador
        const updatedReceipt = await prisma.receipt.update({
          where: { id },
          data: {
            creatorId: newCreatorParticipant.userId,
          },
        });

        // Notifica transferência (assíncrono)
        notifyCreatorTransferred(id, userId, newCreatorParticipant.userId).catch(
          console.error
        );

        // Busca recibo completo para retornar
        const receiptWithRelations = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: {
              include: {
                participant: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            receiptItems: true,
            pendingParticipants: {
              include: {
                user: true,
              },
            },
            deletionRequests: true,
          },
        });

        if (!receiptWithRelations) {
          throw new Error('Erro ao buscar recibo');
        }

        return reply.send({
          receipt: formatReceiptResponse(receiptWithRelations),
        });
      } catch (error) {
        console.error('Error transferring creator:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao transferir criador',
            statusCode: 500,
          },
        });
      }
    }
  );

  // DELETE /api/receipts/:id/participants/:participantId - Remover participante
  fastify.delete<{ Params: { id: string; participantId: string } }>(
    '/:id/participants/:participantId',
    { preHandler: [authenticate, checkIsCreator] },
    async (
      request: FastifyRequest<{ Params: { id: string; participantId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id, participantId } = request.params;

        // Remove participante e seus itens em transação
        await prisma.$transaction(async (tx) => {
          // Remove itens do participante
          await tx.receiptItem.deleteMany({
            where: {
              receiptId: id,
              participantId: participantId,
            },
          });

          // Remove participante do recibo
          await tx.receiptParticipant.deleteMany({
            where: {
              receiptId: id,
              participantId: participantId,
            },
          });
        });

        // Recalcula total
        await recalculateReceiptTotal(id);

        // Busca recibo atualizado
        const receipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: {
              include: {
                participant: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            receiptItems: true,
            pendingParticipants: {
              include: {
                user: true,
              },
            },
            deletionRequests: true,
          },
        });

        if (!receipt) {
          return reply.status(404).send({
            error: {
              message: 'Recibo não encontrado',
              statusCode: 404,
            },
          });
        }

        return reply.send({
          receipt: formatReceiptResponse(receipt),
        });
      } catch (error) {
        console.error('Error removing participant:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao remover participante',
            statusCode: 500,
          },
        });
      }
    }
  );

  // POST /api/receipts/:id/participants/:participantId/close - Fechar participação
  fastify.post<{ Params: { id: string; participantId: string } }>(
    '/:id/participants/:participantId/close',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { id: string; participantId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        if (!request.userPayload) {
          return reply.status(401).send({
            error: {
              message: 'Não autenticado',
              statusCode: 401,
            },
          });
        }

        const { id, participantId } = request.params;
        const userId = request.userPayload.id;

        // Verifica se é o participante ou criador
        const receipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: {
              include: {
                participant: true,
              },
            },
          },
        });

        if (!receipt) {
          return reply.status(404).send({
            error: {
              message: 'Recibo não encontrado',
              statusCode: 404,
            },
          });
        }

        const receiptParticipant = receipt.receiptParticipants.find(
          (rp) => rp.participantId === participantId
        );

        if (!receiptParticipant) {
          return reply.status(404).send({
            error: {
              message: 'Participante não encontrado',
              statusCode: 404,
            },
          });
        }

        // Verifica permissão (pode ser o próprio participante ou criador)
        const isCreator = receipt.creatorId === userId;
        const isParticipant = receiptParticipant.participant.userId === userId;

        if (!isCreator && !isParticipant) {
          return reply.status(403).send({
            error: {
              message: 'Sem permissão para fechar esta participação',
              statusCode: 403,
            },
          });
        }

        // Fecha participação
        await prisma.participant.update({
          where: { id: participantId },
          data: { isClosed: true },
        });

        // Recalcula total
        await recalculateReceiptTotal(id);

        // Busca recibo atualizado
        const updatedReceipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: {
              include: {
                participant: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            receiptItems: true,
            pendingParticipants: {
              include: {
                user: true,
              },
            },
            deletionRequests: true,
          },
        });

        if (!updatedReceipt) {
          return reply.status(404).send({
            error: {
              message: 'Recibo não encontrado',
              statusCode: 404,
            },
          });
        }

        return reply.send({
          receipt: formatReceiptResponse(updatedReceipt),
        });
      } catch (error) {
        console.error('Error closing participant:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao fechar participação',
            statusCode: 500,
          },
        });
      }
    }
  );

  // GET /api/receipts/:id/participants/user-ids - Buscar user IDs dos participantes
  fastify.get<{ Params: { id: string } }>(
    '/:id/participants/user-ids',
    { preHandler: [authenticate, checkIsParticipant] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const receipt = await prisma.receipt.findUnique({
          where: { id },
          include: {
            receiptParticipants: {
              include: {
                participant: true,
              },
            },
          },
        });

        if (!receipt) {
          return reply.status(404).send({
            error: {
              message: 'Recibo não encontrado',
              statusCode: 404,
            },
          });
        }

        const userIds = receipt.receiptParticipants
          .map((rp) => rp.participant.userId)
          .filter((userId): userId is string => userId !== null);

        return reply.send({
          userIds,
        });
      } catch (error) {
        console.error('Error fetching participant user IDs:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao buscar user IDs',
            statusCode: 500,
          },
        });
      }
    }
  );

  // GET /api/receipts/dashboard-stats - Estatísticas do dashboard
  fastify.get<{ Querystring: { year?: string } }>(
    '/dashboard-stats',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!request.userPayload) {
          return reply.status(401).send({
            error: {
              message: 'Não autenticado',
              statusCode: 401,
            },
          });
        }

        const userId = request.userPayload.id;
        const query = request.query as { year?: string };
        const year = query.year
          ? parseInt(query.year, 10)
          : new Date().getFullYear();

        // Busca despesas do usuário (apenas recibos fechados)
        const expenses = await prisma.userReceiptExpense.findMany({
          where: {
            userId,
            isClosed: true,
            receiptDate: {
              gte: new Date(`${year}-01-01`),
              lt: new Date(`${year + 1}-01-01`),
            },
          },
          orderBy: {
            receiptDate: 'asc',
          },
        });

        // Agrupa por período (mês)
        const expensesByPeriodMap = new Map<string, { total: number; receiptCount: number }>();
        expenses.forEach((expense) => {
          const period = expense.periodMonth;
          if (!period) return;
          const current = expensesByPeriodMap.get(period) || { total: 0, receiptCount: 0 };
          expensesByPeriodMap.set(period, {
            total: current.total + Number(expense.totalSpent),
            receiptCount: current.receiptCount + 1,
          });
        });

        const expensesByPeriod = Array.from(expensesByPeriodMap.entries())
          .map(([period, data]) => ({
            period,
            total: data.total,
            receiptCount: data.receiptCount,
          }))
          .sort((a, b) => a.period.localeCompare(b.period));

        // Agrupa por dia
        const expensesByDayMap = new Map<string, { total: number; receiptCount: number }>();
        expenses.forEach((expense) => {
          const day = expense.periodDay;
          if (!day) return;
          const current = expensesByDayMap.get(day) || { total: 0, receiptCount: 0 };
          expensesByDayMap.set(day, {
            total: current.total + Number(expense.totalSpent),
            receiptCount: current.receiptCount + 1,
          });
        });

        const expensesByDay = Array.from(expensesByDayMap.entries())
          .map(([day, data]) => ({
            day,
            total: data.total,
            receiptCount: data.receiptCount,
          }))
          .sort((a, b) => a.day.localeCompare(b.day));

        // Distribuição de gastos
        const expenseDistributionMap = new Map<
          string,
          {
            receiptId: string;
            receiptTitle: string;
            receiptDate: string;
            totalSpent: number;
            isClosed: boolean;
          }
        >();

        expenses.forEach((expense) => {
          const key = expense.receiptId;
          if (!key) return;
          const current = expenseDistributionMap.get(key);
          if (current) {
            expenseDistributionMap.set(key, {
              ...current,
              totalSpent: current.totalSpent + Number(expense.totalSpent),
            });
          } else {
            expenseDistributionMap.set(key, {
              receiptId: key,
              receiptTitle: expense.receiptTitle || '',
              receiptDate: expense.receiptDate.toISOString(),
              totalSpent: Number(expense.totalSpent),
              isClosed: expense.isClosed,
            });
          }
        });

        const expenseDistribution = Array.from(expenseDistributionMap.values()).sort(
          (a, b) => new Date(b.receiptDate).getTime() - new Date(a.receiptDate).getTime()
        );

        return reply.send({
          expensesByPeriod,
          expensesByDay,
          expenseDistribution,
        });
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao buscar estatísticas',
            statusCode: 500,
          },
        });
      }
    }
  );
}
