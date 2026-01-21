import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest, CreateUserDto, UpdateUserDto } from '../types';

export async function userRoutes(fastify: FastifyInstance) {
  // Listar todos os usuários
  fastify.get(
    '/',
    { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const users = await prisma.user.findMany({
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
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const user = await prisma.user.findUnique({
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
    { preHandler: authenticate },
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
        const existingUser = await prisma.user.findUnique({
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

        const user = await prisma.user.create({
          data: {
            email,
            name: name || null,
          },
        });

        return reply.status(201).send({
          message: 'User created successfully',
          data: user,
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
    { preHandler: authenticate },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateUserDto }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const { email, name } = request.body;

        // Verificar se usuário existe
        const existingUser = await prisma.user.findUnique({
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
          const emailExists = await prisma.user.findUnique({
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

        const user = await prisma.user.update({
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
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        // Verificar se usuário existe
        const existingUser = await prisma.user.findUnique({
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

        await prisma.user.delete({
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
