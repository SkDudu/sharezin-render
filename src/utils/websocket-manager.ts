import { randomUUID } from 'crypto';

export interface WebSocketConnection {
  id: string;
  socket: any; // Fastify WebSocket connection
  userId?: string;
  subscriptions: Set<string>; // receiptIds, 'notifications', etc.
  isAlive: boolean;
  createdAt: Date;
  pingInterval?: NodeJS.Timeout;
  pongTimeout?: NodeJS.Timeout;
}

/**
 * Gerenciador de conexões WebSocket
 * Mantém controle de todas as conexões ativas e permite broadcast
 */
export class ConnectionManager {
  private connections: Map<string, WebSocketConnection>;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.connections = new Map();
    this.startHeartbeat();
  }

  /**
   * Adiciona uma nova conexão
   */
  addConnection(socket: any, userId?: string): string {
    const id = randomUUID();
    const connection: WebSocketConnection = {
      id,
      socket,
      userId,
      subscriptions: new Set(),
      isAlive: true,
      createdAt: new Date(),
    };

    this.connections.set(id, connection);
    this.startHeartbeatForConnection(connection);

    return id;
  }

  /**
   * Remove uma conexão
   */
  removeConnection(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      this.cleanupConnection(connection);
      this.connections.delete(id);
    }
  }

  /**
   * Obtém conexão por ID
   */
  getConnection(id: string): WebSocketConnection | undefined {
    return this.connections.get(id);
  }

  /**
   * Obtém todas as conexões de um usuário
   */
  getConnectionsByUserId(userId: string): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.userId === userId
    );
  }

  /**
   * Obtém todas as conexões inscritas em um recibo
   */
  getConnectionsByReceiptId(receiptId: string): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter((conn) =>
      conn.subscriptions.has(receiptId)
    );
  }

  /**
   * Obtém todas as conexões inscritas em notificações
   */
  getConnectionsSubscribedToNotifications(): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter((conn) =>
      conn.subscriptions.has('notifications')
    );
  }

  /**
   * Adiciona subscription a uma conexão
   */
  subscribe(connectionId: string, channel: string): boolean {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.subscriptions.add(channel);
      return true;
    }
    return false;
  }

  /**
   * Remove subscription de uma conexão
   */
  unsubscribe(connectionId: string, channel: string): boolean {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.subscriptions.delete(channel);
      return true;
    }
    return false;
  }

  /**
   * Envia mensagem para uma conexão específica
   */
  sendToConnection(connectionId: string, message: any): boolean {
    const connection = this.connections.get(connectionId);
    if (connection && connection.socket.readyState === 1) {
      try {
        connection.socket.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Error sending message to connection:', error);
        return false;
      }
    }
    return false;
  }

  /**
   * Broadcast para um usuário específico
   */
  broadcastToUser(userId: string, message: any): number {
    const connections = this.getConnectionsByUserId(userId);
    let sent = 0;
    connections.forEach((conn) => {
      if (this.sendToConnection(conn.id, message)) {
        sent++;
      }
    });
    return sent;
  }

  /**
   * Broadcast para todos os participantes de um recibo
   */
  broadcastToReceipt(receiptId: string, message: any): number {
    const connections = this.getConnectionsByReceiptId(receiptId);
    let sent = 0;
    connections.forEach((conn) => {
      if (this.sendToConnection(conn.id, message)) {
        sent++;
      }
    });
    return sent;
  }

  /**
   * Broadcast para todos inscritos em notificações
   */
  broadcastToNotifications(message: any): number {
    const connections = this.getConnectionsSubscribedToNotifications();
    let sent = 0;
    connections.forEach((conn) => {
      if (this.sendToConnection(conn.id, message)) {
        sent++;
      }
    });
    return sent;
  }

  /**
   * Broadcast para todas as conexões
   */
  broadcastToAll(message: any): number {
    let sent = 0;
    this.connections.forEach((conn) => {
      if (this.sendToConnection(conn.id, message)) {
        sent++;
      }
    });
    return sent;
  }

  /**
   * Inicia heartbeat para uma conexão específica
   */
  private startHeartbeatForConnection(connection: WebSocketConnection): void {
    // Limpa intervalos anteriores se existirem
    if (connection.pingInterval) {
      clearInterval(connection.pingInterval);
    }
    if (connection.pongTimeout) {
      clearTimeout(connection.pongTimeout);
    }

    // Ping a cada 30 segundos
    connection.pingInterval = setInterval(() => {
      if (!connection.isAlive) {
        // Conexão não respondeu ao ping anterior, fechar
        this.removeConnection(connection.id);
        try {
          connection.socket.terminate();
        } catch (error) {
          // Conexão já fechada
        }
        return;
      }

      connection.isAlive = false;

      // Envia ping JSON (compatibilidade)
      try {
        if (connection.socket.readyState === 1) {
          connection.socket.send(JSON.stringify({ type: 'ping' }));

          // Timeout para detectar conexão stale (10 segundos)
          connection.pongTimeout = setTimeout(() => {
            if (!connection.isAlive) {
              this.removeConnection(connection.id);
              try {
                connection.socket.terminate();
              } catch (error) {
                // Conexão já fechada
              }
            }
          }, 10000);
        }
      } catch (error) {
        // Erro ao enviar ping, remover conexão
        this.removeConnection(connection.id);
      }
    }, 30000);
  }

  /**
   * Marca conexão como viva (chamado quando recebe pong)
   */
  markConnectionAlive(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.isAlive = true;
      if (connection.pongTimeout) {
        clearTimeout(connection.pongTimeout);
        connection.pongTimeout = undefined;
      }
    }
  }

  /**
   * Limpa recursos de uma conexão
   */
  private cleanupConnection(connection: WebSocketConnection): void {
    if (connection.pingInterval) {
      clearInterval(connection.pingInterval);
    }
    if (connection.pongTimeout) {
      clearTimeout(connection.pongTimeout);
    }
  }

  /**
   * Inicia heartbeat global (limpeza periódica)
   */
  private startHeartbeat(): void {
    // Limpeza periódica de conexões mortas a cada minuto
    setInterval(() => {
      const now = Date.now();
      this.connections.forEach((conn) => {
        // Remove conexões que não estão mais abertas
        if (conn.socket.readyState !== 1) {
          this.removeConnection(conn.id);
        }
      });
    }, 60000);
  }

  /**
   * Fecha todas as conexões (usado no graceful shutdown)
   */
  closeAllConnections(): void {
    const shutdownMessage = {
      type: 'shutdown',
      message: 'Server is shutting down. Please reconnect.',
    };

    this.connections.forEach((conn) => {
      try {
        if (conn.socket.readyState === 1) {
          conn.socket.send(JSON.stringify(shutdownMessage));
          conn.socket.close(1001, 'Server shutting down');
        }
      } catch (error) {
        console.error('Error closing connection:', error);
      }
      this.cleanupConnection(conn);
    });

    this.connections.clear();
  }

  /**
   * Obtém estatísticas das conexões
   */
  getStats(): {
    totalConnections: number;
    connectionsByUser: Map<string, number>;
    totalSubscriptions: number;
  } {
    const connectionsByUser = new Map<string, number>();
    let totalSubscriptions = 0;

    this.connections.forEach((conn) => {
      if (conn.userId) {
        connectionsByUser.set(
          conn.userId,
          (connectionsByUser.get(conn.userId) || 0) + 1
        );
      }
      totalSubscriptions += conn.subscriptions.size;
    });

    return {
      totalConnections: this.connections.size,
      connectionsByUser,
      totalSubscriptions,
    };
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager();
