import { FastifyInstance } from 'fastify';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

export async function realtimeRoutes(fastify: FastifyInstance) {
  await fastify.register(async function (fastify) {
    // WebSocket endpoint para realtime
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      connection.on('message', async (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());

          // Exemplo: Subscribe to changes in users table
          if (data.type === 'subscribe' && data.table) {
            const channel = supabase
              .channel(`realtime:${data.table}`)
              .on(
                'postgres_changes',
                {
                  event: '*',
                  schema: 'public',
                  table: data.table,
                },
                (payload) => {
                  connection.send(
                    JSON.stringify({
                      type: 'change',
                      table: data.table,
                      payload,
                    })
                  );
                }
              )
              .subscribe();

            connection.send(
              JSON.stringify({
                type: 'subscribed',
                table: data.table,
              })
            );

            // Cleanup on close
            connection.on('close', () => {
              supabase.removeChannel(channel);
            });
          } else if (data.type === 'ping') {
            connection.send(JSON.stringify({ type: 'pong' }));
          }
        } catch (error) {
          console.error('WebSocket error:', error);
          connection.send(
            JSON.stringify({
              type: 'error',
              message: 'Invalid message format',
            })
          );
        }
      });

      connection.on('close', () => {
        console.log('WebSocket connection closed');
      });

      // Send welcome message
      connection.send(
        JSON.stringify({
          type: 'connected',
          message: 'Connected to realtime server',
        })
      );
    });
  });
}
