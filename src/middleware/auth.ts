import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { AuthenticatedRequest } from '../types';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    await request.jwtVerify();
    
    // Adicionar usuário ao request
    const payload = request.user as { id: string; email: string };
    (request as AuthenticatedRequest).user = {
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
