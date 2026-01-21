import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { checkReceiptAccess } from '../utils/receipts';

/**
 * Middleware para verificar se o usuário é o criador do recibo
 */
export async function checkIsCreator(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
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

  const access = await checkReceiptAccess(userId, id);

  if (!access.hasAccess) {
    return reply.status(404).send({
      error: {
        message: 'Recibo não encontrado',
        statusCode: 404,
      },
    });
  }

  if (!access.isCreator) {
    return reply.status(403).send({
      error: {
        message: 'Apenas o criador pode realizar esta ação',
        statusCode: 403,
      },
    });
  }
}

/**
 * Middleware para verificar se o usuário é participante do recibo
 */
export async function checkIsParticipant(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
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

  const access = await checkReceiptAccess(userId, id);

  if (!access.hasAccess) {
    return reply.status(403).send({
      error: {
        message: 'Sem permissão para acessar este recibo',
        statusCode: 403,
      },
    });
  }
}

/**
 * Middleware para verificar se o recibo não está fechado
 */
export async function checkReceiptNotClosed(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params;

  const receipt = await prisma.receipt.findUnique({
    where: { id },
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
        message: 'Não é possível modificar um recibo fechado',
        statusCode: 400,
      },
    });
  }
}

/**
 * Middleware combinado: verifica se é criador E recibo não está fechado
 */
export async function checkIsCreatorAndNotClosed(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  await checkIsCreator(request, reply);
  if (reply.sent) return;
  await checkReceiptNotClosed(request, reply);
}

/**
 * Middleware combinado: verifica se é participante E recibo não está fechado
 */
export async function checkIsParticipantAndNotClosed(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  await checkIsParticipant(request, reply);
  if (reply.sent) return;
  await checkReceiptNotClosed(request, reply);
}
