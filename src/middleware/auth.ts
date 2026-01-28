import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest } from '../types';

export const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    await request.jwtVerify();
    
    // Adicionar usuário ao request
    const payload = request.user as { id: string; email: string };
    request.userPayload = {
      id: payload.id,
      email: payload.email,
    };
  } catch (error) {
    return reply.status(401).send({
      error: {
        message: 'Invalid or expired token',
        statusCode: 401,
      },
    });
  }
};
