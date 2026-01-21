import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest, CreateUserDto, UpdateUserDto } from '../types';

export async function userRoutes(fastify: FastifyInstance) {
  // Listar todos os usuários
  fastify.get(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const users = await prisma.sharezinUser.findMany({
          orderBy: {
            createdAt: 'desc',
          },
        });

        return reply.send({
          data: users,
          count: users.length,
        });
      } catch (error) {
        console.error('Error fetching users:', error);
        return reply.status(500).send({
          error: {
            message: 'Internal server error',
            statusCode: 500,
          },
        });
      }
    }
  );

  // Buscar usuário por ID
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const user = await prisma.sharezinUser.findUnique({
          where: { id },
        });

        if (!user) {
          return reply.status(404).send({
            error: {
              message: 'User not found',
              statusCode: 404,
            },
          });
        }

        return reply.send({
          data: user,
        });
      } catch (error) {
        console.error('Error fetching user:', error);
        return reply.status(500).send({
          error: {
            message: 'Internal server error',
            statusCode: 500,
          },
        });
      }
    }
  );

  // Criar novo usuário
  fastify.post<{ Body: CreateUserDto }>(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Body: CreateUserDto }>, reply: FastifyReply) => {
      try {
        const { email, name } = request.body;

        if (!email) {
          return reply.status(400).send({
            error: {
              message: 'Email is required',
              statusCode: 400,
            },
          });
        }

        // Verificar se email já existe
        const existingUser = await prisma.sharezinUser.findUnique({
          where: { email },
        });

        if (existingUser) {
          return reply.status(409).send({
            error: {
              message: 'User with this email already exists',
              statusCode: 409,
            },
          });
        }

        // Esta rota não deve criar usuários com senha - use /api/auth/register
        // Por enquanto, retornar erro
        return reply.status(400).send({
          error: {
            message: 'Use /api/auth/register to create users with passwords',
            statusCode: 400,
          },
        });

        // Esta rota não deve criar usuários - use /api/auth/register
        return reply.status(400).send({
          error: {
            message: 'Use /api/auth/register to create users',
            statusCode: 400,
          },
        });
      } catch (error) {
        console.error('Error creating user:', error);
        return reply.status(500).send({
          error: {
            message: 'Internal server error',
            statusCode: 500,
          },
        });
      }
    }
  );

  // Atualizar usuário
  fastify.put<{ Params: { id: string }; Body: UpdateUserDto }>(
    '/:id',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateUserDto }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const body = request.body as UpdateUserDto;
        const { email, name } = body;

        // Verificar se usuário existe
        const existingUser = await prisma.sharezinUser.findUnique({
          where: { id },
        });

        if (!existingUser) {
          return reply.status(404).send({
            error: {
              message: 'User not found',
              statusCode: 404,
            },
          });
        }

        // Se email está sendo atualizado, verificar se já existe
        if (email && email !== existingUser.email) {
          const emailExists = await prisma.sharezinUser.findUnique({
            where: { email },
          });

          if (emailExists) {
            return reply.status(409).send({
              error: {
                message: 'Email already in use',
                statusCode: 409,
              },
            });
          }
        }

        const user = await prisma.sharezinUser.update({
          where: { id },
          data: {
            ...(email && { email }),
            ...(name !== undefined && { name }),
          },
        });

        return reply.send({
          message: 'User updated successfully',
          data: user,
        });
      } catch (error) {
        console.error('Error updating user:', error);
        return reply.status(500).send({
          error: {
            message: 'Internal server error',
            statusCode: 500,
          },
        });
      }
    }
  );

  // Deletar usuário
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        // Verificar se usuário existe
        const existingUser = await prisma.sharezinUser.findUnique({
          where: { id },
        });

        if (!existingUser) {
          return reply.status(404).send({
            error: {
              message: 'User not found',
              statusCode: 404,
            },
          });
        }

        await prisma.sharezinUser.delete({
          where: { id },
        });

        return reply.send({
          message: 'User deleted successfully',
        });
      } catch (error) {
        console.error('Error deleting user:', error);
        return reply.status(500).send({
          error: {
            message: 'Internal server error',
            statusCode: 500,
          },
        });
      }
    }
  );
}
