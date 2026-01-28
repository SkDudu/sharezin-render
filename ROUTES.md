# Documentação de Rotas da API

Base URL: `/api`

Todas as rotas (exceto login, register e health check) requerem autenticação via Bearer Token no header:
```
Authorization: Bearer <token>
```

---

## 🔐 Autenticação (`/api/auth`)

### POST `/api/auth/login`
Autentica um usuário e retorna token JWT.

**Autenticação**: Não requerida

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response 200**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Erros**:
- `400`: Email e senha são obrigatórios
- `401`: Credenciais inválidas
- `500`: Erro ao processar login

---

### POST `/api/auth/register`
Registra um novo usuário e retorna token JWT.

**Autenticação**: Não requerida

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "user@example.com",
  "password": "password123"
}
```

**Validações**:
- Nome, email e senha são obrigatórios
- Senha deve ter pelo menos 6 caracteres
- Email deve ser único

**Response 201**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Erros**:
- `400`: Nome, email e senha são obrigatórios | Email já cadastrado | Senha deve ter pelo menos 6 caracteres
- `500`: Erro ao processar registro

---

### GET `/api/auth/me`
Retorna informações do usuário autenticado.

**Autenticação**: Requerida

**Response 200**:
```json
{
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Erros**:
- `401`: Não autenticado
- `404`: Usuário não encontrado

---

### POST `/api/auth/change-password`
Altera a senha do usuário autenticado.

**Autenticação**: Requerida

**Request Body**:
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword123"
}
```

**Validações**:
- Senha atual e nova senha são obrigatórias
- Nova senha deve ter pelo menos 6 caracteres
- Nova senha deve ser diferente da senha atual

**Response 200**:
```json
{
  "success": true,
  "message": "Senha alterada com sucesso"
}
```

**Erros**:
- `400`: Senha atual e nova senha são obrigatórias | Nova senha deve ter pelo menos 6 caracteres | A nova senha deve ser diferente da senha atual
- `401`: Senha atual incorreta | Não autenticado
- `404`: Usuário não encontrado
- `500`: Erro ao atualizar senha

---

## 👥 Usuários (`/api/users`)

### GET `/api/users`
Lista todos os usuários.

**Autenticação**: Requerida

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "John Doe",
      "email": "user@example.com",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Erros**:
- `401`: Não autenticado
- `500`: Erro ao buscar usuários

---

### GET `/api/users/:id`
Busca um usuário por ID.

**Autenticação**: Requerida

**Path Parameters**:
- `id` (UUID): ID do usuário

**Response 200**:
```json
{
  "data": {
    "id": "uuid",
    "name": "John Doe",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Erros**:
- `401`: Não autenticado
- `404`: Usuário não encontrado
- `500`: Erro ao buscar usuário

---

### POST `/api/users`
⚠️ **Nota**: Esta rota está desabilitada. Use `/api/auth/register` para criar usuários.

**Autenticação**: Requerida

**Response 400**:
```json
{
  "error": {
    "message": "Use /api/auth/register to create users",
    "statusCode": 400
  }
}
```

---

### PUT `/api/users/:id`
Atualiza um usuário existente.

**Autenticação**: Requerida

**Path Parameters**:
- `id` (UUID): ID do usuário

**Request Body**:
```json
{
  "email": "newemail@example.com",
  "name": "New Name"
}
```

**Response 200**:
```json
{
  "message": "User updated successfully",
  "data": {
    "id": "uuid",
    "name": "New Name",
    "email": "newemail@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Erros**:
- `401`: Não autenticado
- `404`: Usuário não encontrado
- `409`: Email já em uso
- `500`: Erro ao atualizar usuário

---

### DELETE `/api/users/:id`
Deleta um usuário.

**Autenticação**: Requerida

**Path Parameters**:
- `id` (UUID): ID do usuário

**Response 200**:
```json
{
  "message": "User deleted successfully"
}
```

**Erros**:
- `401`: Não autenticado
- `404`: Usuário não encontrado
- `500`: Erro ao deletar usuário

---

## 🔄 Realtime (`/api/realtime`)

### WebSocket `/api/realtime/ws`
Endpoint WebSocket para conexões em tempo real com Supabase Realtime, notificações e eventos de recibos.

**Autenticação**: Opcional (via query param `?token=JWT_TOKEN` ou header `Authorization: Bearer TOKEN`)

**Conexão**:
```javascript
// Sem autenticação
const ws = new WebSocket('ws://localhost:3000/api/realtime/ws');

// Com autenticação (recomendado para notificações)
const ws = new WebSocket('ws://localhost:3000/api/realtime/ws?token=JWT_TOKEN');
// ou
const ws = new WebSocket('wss://seu-app.onrender.com/api/realtime/ws?token=JWT_TOKEN');
```

**Mensagens Enviadas (Cliente → Servidor)**:

1. **Subscribe to notifications** (requer autenticação):
```json
{
  "type": "subscribe",
  "channel": "notifications"
}
```

2. **Subscribe to receipt changes**:
```json
{
  "type": "subscribe",
  "channel": "receipt",
  "receiptId": "uuid-do-receipt"
}
```

3. **Subscribe to Supabase table changes** (legado):
```json
{
  "type": "subscribe",
  "table": "users"
}
```

4. **Unsubscribe**:
```json
{
  "type": "unsubscribe",
  "channel": "notifications"
}
```

5. **Ping** (heartbeat):
```json
{
  "type": "ping"
}
```

**Mensagens Recebidas (Servidor → Cliente)**:

1. **Connection established**:
```json
{
  "type": "connected",
  "message": "Connected to realtime server",
  "authenticated": true,
  "userId": "uuid" // ou null se não autenticado
}
```

2. **Subscribed**:
```json
{
  "type": "subscribed",
  "channel": "notifications"
}
```

3. **Notification** (quando inscrito em 'notifications'):
```json
{
  "type": "notification",
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "type": "receipt_closed",
    "title": "Recibo Fechado",
    "message": "O recibo foi fechado",
    "receiptId": "uuid",
    "relatedUserId": "uuid",
    "isRead": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

4. **Receipt event** (quando inscrito em um recibo):
```json
{
  "type": "receipt_event",
  "receiptId": "uuid",
  "event": "item_added",
  "data": {
    "item": {
      "name": "Produto",
      "quantity": 1,
      "price": 10.50,
      "participantId": "uuid"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Tipos de eventos de recibo**:
- `receipt_updated` - Recibo foi atualizado
- `receipt_closed` - Recibo foi fechado
- `item_added` - Item adicionado ao recibo
- `item_removed` - Item removido do recibo
- `item_updated` - Item atualizado
- `participant_added` - Participante adicionado
- `participant_removed` - Participante removido
- `participant_closed` - Participação fechada
- `participant_requested` - Nova solicitação de participação
- `participant_approved` - Participação aprovada
- `participant_rejected` - Participação rejeitada
- `creator_transferred` - Criador transferido

5. **Table change** (Supabase postgres_changes - legado):
```json
{
  "type": "change",
  "table": "users",
  "payload": {
    "eventType": "INSERT",
    "new": { ... },
    "old": null
  }
}
```

6. **Pong** (resposta ao ping):
```json
{
  "type": "pong"
}
```

7. **Shutdown warning** (servidor desligando):
```json
{
  "type": "shutdown",
  "message": "Server is shutting down. Please reconnect."
}
```

8. **Error**:
```json
{
  "type": "error",
  "message": "Invalid message format"
}
```

---

## 🏥 Health Check

### GET `/health`
Verifica o status do servidor.

**Autenticação**: Não requerida

**Response 200**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 12345.67
}
```

---

## 📝 Rotas Planeadas (Não Implementadas)

Baseado no contrato da API (`api-contract.json`), as seguintes rotas estão planeadas mas ainda não implementadas:

### Recibos (`/api/receipts`)
- `GET /api/receipts` - Listar recibos
- `GET /api/receipts/:id` - Buscar recibo por ID
- `GET /api/receipts/invite/:inviteCode` - Buscar recibo por código de convite
- `POST /api/receipts` - Criar recibo
- `PUT /api/receipts/:id` - Atualizar recibo
- `DELETE /api/receipts/:id` - Deletar recibo
- `POST /api/receipts/:id/close` - Fechar recibo
- `POST /api/receipts/:id/request-join` - Solicitar entrada em recibo
- `PUT /api/receipts/:id/transfer-creator` - Transferir criador
- `GET /api/receipts/dashboard-stats` - Estatísticas do dashboard

### Participantes (`/api/receipts/:id/participants`)
- `DELETE /api/receipts/:id/participants/:participantId` - Remover participante
- `POST /api/receipts/:id/participants/:participantId/close` - Fechar participação
- `GET /api/receipts/:id/participants/user-ids` - Buscar user IDs dos participantes

### Participantes (`/api/participants`)
- `GET /api/participants/:id/user-id` - Buscar user ID de um participante

### Notificações (`/api/notifications`)
- `GET /api/notifications` - Listar notificações
- `POST /api/notifications` - Criar notificação
- `PUT /api/notifications` - Marcar notificações como lidas
- `PUT /api/notifications/:id` - Marcar uma notificação como lida
- `DELETE /api/notifications/:id` - Deletar notificação

### Planos (`/api/plans`)
- `GET /api/plans` - Listar planos disponíveis

### Assinaturas (`/api/subscriptions`)
- `GET /api/subscriptions` - Obter assinatura ativa
- `POST /api/subscriptions` - Criar assinatura
- `PUT /api/subscriptions` - Cancelar assinatura
- `POST /api/subscriptions/cancel` - Cancelar assinatura (alternativo)

---

## 🔑 Autenticação

Todas as rotas protegidas requerem um token JWT no header:

```
Authorization: Bearer <token>
```

O token é obtido através de:
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registro

O token JWT contém:
```json
{
  "id": "user-uuid",
  "email": "user@example.com"
}
```

---

## 📊 Códigos de Status HTTP

- `200` - Sucesso
- `201` - Criado com sucesso
- `204` - Sem conteúdo (sucesso sem retorno)
- `400` - Bad Request (dados inválidos)
- `401` - Unauthorized (não autenticado ou token inválido)
- `403` - Forbidden (sem permissão)
- `404` - Not Found (recurso não encontrado)
- `409` - Conflict (recurso já existe)
- `500` - Internal Server Error (erro interno)
- `503` - Service Unavailable (serviço temporariamente indisponível)

---

## 🛠️ Exemplos de Uso

### Exemplo: Login e usar token

```bash
# 1. Fazer login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# Resposta:
# {
#   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "user": { ... }
# }

# 2. Usar token para acessar rota protegida
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Exemplo: WebSocket

```javascript
const token = 'seu-jwt-token'; // Obtido do login
const ws = new WebSocket(`ws://localhost:3000/api/realtime/ws?token=${token}`);

ws.onopen = () => {
  console.log('Connected');
  
  // Subscribe to notifications (requer autenticação)
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'notifications'
  }));
  
  // Subscribe to receipt changes
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'receipt',
    receiptId: 'uuid-do-receipt'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'connected':
      console.log('Connected:', data.message, 'Authenticated:', data.authenticated);
      break;
    case 'notification':
      console.log('New notification:', data.data);
      // Atualizar UI com notificação
      break;
    case 'receipt_event':
      console.log('Receipt event:', data.event, data.data);
      // Atualizar UI do recibo
      break;
    case 'pong':
      // Heartbeat response
      break;
    case 'shutdown':
      console.log('Server shutting down, reconnecting...');
      // Implementar reconexão
      break;
    case 'error':
      console.error('Error:', data.message);
      break;
    default:
      console.log('Received:', data);
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected');
  // Implementar reconexão com exponential backoff
};

// Enviar ping periódico (opcional, servidor também envia)
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);
```

---

## 📌 Notas Importantes

1. **Base URL**: Todas as rotas da API estão prefixadas com `/api`
2. **Autenticação**: Use o token JWT retornado no login/register
3. **Content-Type**: Use `application/json` para requisições com body
4. **IDs**: Todos os IDs são UUIDs (v4)
5. **Timestamps**: Todos os timestamps estão em formato ISO 8601 (UTC)
6. **Validação**: Sempre valide os dados antes de enviar requisições
7. **Erros**: Sempre trate os erros retornados pela API

---

## 🔄 Versão da API

Versão atual: `2.0.0`

Última atualização: 2024
