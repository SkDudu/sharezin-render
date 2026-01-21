import { FastifyReply, FastifyRequest } from 'fastify';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  error: Error | AppError,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        message: error.message,
        statusCode: error.statusCode,
      },
    });
  }

  // Erro não tratado
  console.error('Unhandled error:', error);
  return reply.status(500).send({
    error: {
      message: 'Internal server error',
      statusCode: 500,
    },
  });
};

export const notFoundHandler = (request: FastifyRequest, reply: FastifyReply) => {
  reply.status(404).send({
    error: {
      message: 'Route not found',
      statusCode: 404,
    },
  });
};
