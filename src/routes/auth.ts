import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { hashPassword, comparePassword } from '../utils/password';
import { LoginDto, CreateUserDto, ChangePasswordDto } from '../types';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

export async function authRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post<{ Body: LoginDto }>(
    '/login',
    async (request: FastifyRequest<{ Body: LoginDto }>, reply: FastifyReply) => {
      try {
        const { email, password } = request.body;

        if (!email || !password) {
          return reply.status(400).send({
            error: {
              message: 'Email e senha são obrigatórios',
              statusCode: 400,
            },
          });
        }

        // Buscar usuário no banco
        const user = await prisma.sharezinUser.findUnique({
          where: { email },
        });

        if (!user) {
          return reply.status(401).send({
            error: {
              message: 'Credenciais inválidas',
              statusCode: 401,
            },
          });
        }

        // Verificar senha
        const isValidPassword = await comparePassword(password, user.passwordHash);

        if (!isValidPassword) {
          return reply.status(401).send({
            error: {
              message: 'Credenciais inválidas',
              statusCode: 401,
            },
          });
        }

        // Gerar token JWT (usando Fastify JWT)
        const token = fastify.jwt.sign({
          id: user.id,
          email: user.email,
        });

        return reply.send({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt.toISOString(),
          },
        });
      } catch (error) {
        console.error('Login error:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao processar login',
            statusCode: 500,
          },
        });
      }
    }
  );

  // Registrar novo usuário
  fastify.post<{ Body: CreateUserDto }>(
    '/register',
    async (request: FastifyRequest<{ Body: CreateUserDto }>, reply: FastifyReply) => {
      try {
        const { email, password, name } = request.body;

        if (!email || !password || !name) {
          return reply.status(400).send({
            error: {
              message: 'Nome, email e senha são obrigatórios',
              statusCode: 400,
            },
          });
        }

        if (password.length < 6) {
          return reply.status(400).send({
            error: {
              message: 'Senha deve ter pelo menos 6 caracteres',
              statusCode: 400,
            },
          });
        }

        // Verificar se email já existe
        const existingUser = await prisma.sharezinUser.findUnique({
          where: { email },
        });

        if (existingUser) {
          return reply.status(400).send({
            error: {
              message: 'Email já cadastrado',
              statusCode: 400,
            },
          });
        }

        // Hash da senha
        const passwordHash = await hashPassword(password);

        // Criar usuário
        const user = await prisma.sharezinUser.create({
          data: {
            email,
            name,
            passwordHash,
          },
        });

        // Gerar token JWT
        const token = fastify.jwt.sign({
          id: user.id,
          email: user.email,
        });

        return reply.status(201).send({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt.toISOString(),
          },
        });
      } catch (error) {
        console.error('Register error:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao processar registro',
            statusCode: 500,
          },
        });
      }
    }
  );

  // Obter informações do usuário autenticado
  fastify.get(
    '/me',
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

        const user = await prisma.sharezinUser.findUnique({
          where: { id: request.userPayload.id },
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
          },
        });

        if (!user) {
          return reply.status(404).send({
            error: {
              message: 'Usuário não encontrado',
              statusCode: 404,
            },
          });
        }

        return reply.send({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt.toISOString(),
          },
        });
      } catch (error) {
        console.error('Get user error:', error);
        return reply.status(500).send({
          error: {
            message: 'Internal server error',
            statusCode: 500,
          },
        });
      }
    }
  );

  // Alterar senha
  fastify.post<{ Body: ChangePasswordDto }>(
    '/change-password',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Body: ChangePasswordDto }>, reply: FastifyReply) => {
      try {
        if (!request.userPayload) {
          return reply.status(401).send({
            error: {
              message: 'Não autenticado',
              statusCode: 401,
            },
          });
        }

        const { currentPassword, newPassword } = request.body;

        if (!currentPassword || !newPassword) {
          return reply.status(400).send({
            error: {
              message: 'Senha atual e nova senha são obrigatórias',
              statusCode: 400,
            },
          });
        }

        if (newPassword.length < 6) {
          return reply.status(400).send({
            error: {
              message: 'Nova senha deve ter pelo menos 6 caracteres',
              statusCode: 400,
            },
          });
        }

        if (currentPassword === newPassword) {
          return reply.status(400).send({
            error: {
              message: 'A nova senha deve ser diferente da senha atual',
              statusCode: 400,
            },
          });
        }

        // Buscar usuário
        const user = await prisma.sharezinUser.findUnique({
          where: { id: request.userPayload.id },
        });

        if (!user) {
          return reply.status(404).send({
            error: {
              message: 'Usuário não encontrado',
              statusCode: 404,
            },
          });
        }

        // Verificar senha atual
        const isValidPassword = await comparePassword(currentPassword, user.passwordHash);

        if (!isValidPassword) {
          return reply.status(401).send({
            error: {
              message: 'Senha atual incorreta',
              statusCode: 401,
            },
          });
        }

        // Hash da nova senha
        const newPasswordHash = await hashPassword(newPassword);

        // Atualizar senha
        await prisma.sharezinUser.update({
          where: { id: user.id },
          data: {
            passwordHash: newPasswordHash,
          },
        });

        return reply.send({
          success: true,
          message: 'Senha alterada com sucesso',
        });
      } catch (error) {
        console.error('Change password error:', error);
        return reply.status(500).send({
          error: {
            message: 'Erro ao atualizar senha',
            statusCode: 500,
          },
        });
      }
    }
  );
}
