import { FastifyInstance, FastifyRequest } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { connectionManager } from '../utils/websocket-manager';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

/**
 * Verifica token JWT e retorna userId se válido
 */
async function verifyToken(
  fastify: FastifyInstance,
  token?: string
): Promise<{ id: string; email: string } | null> {
  if (!token) {
    return null;
  }

  try {
    const decoded = fastify.jwt.verify(token) as { id: string; email: string };
    return decoded;
  } catch (error) {
    return null;
  }
}

export async function realtimeRoutes(fastify: FastifyInstance) {
  await fastify.register(async function (fastify) {
    // WebSocket endpoint para realtime
    fastify.get('/ws', { websocket: true }, async (connection, req: FastifyRequest) => {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      
      // Tenta autenticar via query param ou header
      const token = 
        (req.query as { token?: string })?.token ||
        req.headers.authorization?.replace('Bearer ', '');
      
      let userId: string | undefined;
      let userEmail: string | undefined;

      if (token) {
        const user = await verifyToken(fastify, token);
        if (user) {
          userId = user.id;
          userEmail = user.email;
        }
      }

      // Adiciona conexão ao gerenciador
      const connectionId = connectionManager.addConnection(connection.socket, userId);

      // Map para armazenar canais Supabase por subscription
      const supabaseChannels = new Map<string, any>();

      connection.on('message', async (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());

          // Handler para ping
          if (data.type === 'ping') {
            connectionManager.markConnectionAlive(connectionId);
            connection.socket.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          // Handler para subscribe
          if (data.type === 'subscribe') {
            const { channel, receiptId, table } = data;

            // Subscribe to notifications (requer autenticação)
            if (channel === 'notifications') {
              if (!userId) {
                connection.socket.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Authentication required to subscribe to notifications',
                  })
                );
                return;
              }

              connectionManager.subscribe(connectionId, 'notifications');
              connection.socket.send(
                JSON.stringify({
                  type: 'subscribed',
                  channel: 'notifications',
                })
              );
              return;
            }

            // Subscribe to receipt changes
            if (channel === 'receipt' && receiptId) {
              // Verifica se usuário tem acesso ao recibo (se autenticado)
              if (userId) {
                // TODO: Verificar acesso ao recibo se necessário
                // Por enquanto, permite subscription se autenticado
              }

              connectionManager.subscribe(connectionId, receiptId);
              connection.socket.send(
                JSON.stringify({
                  type: 'subscribed',
                  channel: 'receipt',
                  receiptId,
                })
              );
              return;
            }

            // Subscribe to Supabase postgres_changes (legado - mantido para compatibilidade)
            if (table) {
              const channelKey = `table:${table}`;
              
              // Evita múltiplas subscriptions na mesma tabela
              if (supabaseChannels.has(channelKey)) {
                connection.socket.send(
                  JSON.stringify({
                    type: 'error',
                    message: `Already subscribed to table: ${table}`,
                  })
                );
                return;
              }

              const supabaseChannel = supabase
                .channel(`realtime:${table}:${connectionId}`)
                .on(
                  'postgres_changes',
                  {
                    event: '*',
                    schema: 'public',
                    table: table,
                  },
                  (payload) => {
                    connection.socket.send(
                      JSON.stringify({
                        type: 'change',
                        table: table,
                        payload,
                      })
                    );
                  }
                )
                .subscribe();

              supabaseChannels.set(channelKey, supabaseChannel);
              connection.socket.send(
                JSON.stringify({
                  type: 'subscribed',
                  table: table,
                })
              );
              return;
            }

            connection.socket.send(
              JSON.stringify({
                type: 'error',
                message: 'Invalid subscription. Provide channel (notifications/receipt) or table',
              })
            );
            return;
          }

          // Handler para unsubscribe
          if (data.type === 'unsubscribe') {
            const { channel, receiptId, table } = data;

            if (channel === 'notifications') {
              connectionManager.unsubscribe(connectionId, 'notifications');
              connection.socket.send(
                JSON.stringify({
                  type: 'unsubscribed',
                  channel: 'notifications',
                })
              );
              return;
            }

            if (channel === 'receipt' && receiptId) {
              connectionManager.unsubscribe(connectionId, receiptId);
              connection.socket.send(
                JSON.stringify({
                  type: 'unsubscribed',
                  channel: 'receipt',
                  receiptId,
                })
              );
              return;
            }

            if (table) {
              const channelKey = `table:${table}`;
              const supabaseChannel = supabaseChannels.get(channelKey);
              if (supabaseChannel) {
                supabase.removeChannel(supabaseChannel);
                supabaseChannels.delete(channelKey);
                connection.socket.send(
                  JSON.stringify({
                    type: 'unsubscribed',
                    table: table,
                  })
                );
              }
              return;
            }

            connection.socket.send(
              JSON.stringify({
                type: 'error',
                message: 'Invalid unsubscribe. Provide channel or table',
              })
            );
            return;
          }

          // Mensagem desconhecida
          connection.socket.send(
            JSON.stringify({
              type: 'error',
              message: 'Unknown message type',
            })
          );
        } catch (error) {
          console.error('WebSocket error:', error);
          connection.socket.send(
            JSON.stringify({
              type: 'error',
              message: 'Invalid message format',
            })
          );
        }
      });

      connection.on('close', () => {
        console.log(`WebSocket connection closed: ${connectionId}`);
        
        // Remove todos os canais Supabase
        supabaseChannels.forEach((channel) => {
          supabase.removeChannel(channel);
        });
        supabaseChannels.clear();

        // Remove conexão do gerenciador
        connectionManager.removeConnection(connectionId);
      });

      connection.on('error', (error) => {
        console.error(`WebSocket error for connection ${connectionId}:`, error);
        connectionManager.removeConnection(connectionId);
      });

      // Send welcome message
      connection.socket.send(
        JSON.stringify({
          type: 'connected',
          message: 'Connected to realtime server',
          authenticated: !!userId,
          userId: userId || null,
        })
      );
    });
  });
}
