import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { userRoutes } from './users';
import { realtimeRoutes } from './realtime';
import { receiptRoutes } from './receipts';

export async function registerRoutes(fastify: FastifyInstance) {
  // Rotas de autenticação
  await fastify.register(authRoutes, { prefix: '/api/auth' });

  // Rotas de usuários
  await fastify.register(userRoutes, { prefix: '/api/users' });

  // Rotas de realtime
  await fastify.register(realtimeRoutes, { prefix: '/api/realtime' });

  // Rotas de recibos
  await fastify.register(receiptRoutes, { prefix: '/api/receipts' });

  // Health check
  fastify.get('/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });
}
