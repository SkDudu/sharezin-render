# Rotas da API – Sharezin

Base URL da API: `/api`  
Autenticação: `Authorization: Bearer <token>` (todas as rotas exceto login, register, invite e health).

---

## Saúde

| Método | Rota       | Auth | Descrição              |
|--------|------------|------|------------------------|
| `GET`  | `/health`  | Não  | Health check do servidor |

---

## Autenticação (`/api/auth`)

| Método | Rota               | Auth | Descrição                          |
|--------|--------------------|------|------------------------------------|
| `POST` | `/api/auth/login`  | Não  | Login (email, password)            |
| `POST` | `/api/auth/register` | Não | Registro (name, email, password)   |
| `GET`  | `/api/auth/me`     | Sim  | Dados do usuário logado            |
| `POST` | `/api/auth/change-password` | Sim | Alterar senha (currentPassword, newPassword) |

---

## Usuários (`/api/users`)

| Método | Rota              | Auth | Descrição                    |
|--------|-------------------|------|------------------------------|
| `GET`  | `/api/users`      | Sim  | Listar usuários              |
| `GET`  | `/api/users/:id`  | Sim  | Buscar usuário por ID        |
| `POST` | `/api/users`      | Sim  | Desabilitada – usar register |
| `PUT`  | `/api/users/:id`  | Sim  | Atualizar usuário            |
| `DELETE` | `/api/users/:id` | Sim  | Excluir usuário              |

---

## Recibos (`/api/receipts`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/api/receipts` | Sim | Listar recibos (query: `includeClosed`, `onlyClosed`, `limit`, `offset`) |
| `GET` | `/api/receipts/:id` | Sim | Buscar recibo por ID |
| `GET` | `/api/receipts/invite/:inviteCode` | Não | Buscar recibo por código de convite |
| `POST` | `/api/receipts` | Sim | Criar recibo |
| `PUT` | `/api/receipts/:id` | Sim | Atualizar recibo |
| `DELETE` | `/api/receipts/:id` | Sim (criador) | Excluir recibo |
| `POST` | `/api/receipts/:id/close` | Sim (criador) | Fechar recibo |
| `POST` | `/api/receipts/:id/request-join` | Sim | Solicitar entrada no recibo |
| `PUT` | `/api/receipts/:id/transfer-creator` | Sim (criador) | Transferir criador do recibo |
| `DELETE` | `/api/receipts/:id/participants/:participantId` | Sim (criador) | Remover participante |
| `POST` | `/api/receipts/:id/participants/:participantId/close` | Sim | Fechar participação |
| `GET` | `/api/receipts/:id/participants/user-ids` | Sim (participante) | Listar user IDs dos participantes |
| `GET` | `/api/receipts/dashboard-stats` | Sim | Estatísticas do dashboard (query: `year`) |

---

## Realtime (`/api/realtime`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` (WebSocket) | `/api/realtime/ws` | Não | WebSocket para eventos em tempo real (Supabase Realtime) |

---

## Resumo por arquivo

| Arquivo      | Prefixo          | Rotas |
|-------------|------------------|--------|
| `index.ts`  | —                | `GET /health` |
| `auth.ts`   | `/api/auth`      | login, register, me, change-password |
| `users.ts`  | `/api/users`     | CRUD usuários |
| `receipts.ts` | `/api/receipts` | CRUD recibos, invite, close, request-join, transfer-creator, participantes, dashboard-stats |
| `realtime.ts` | `/api/realtime` | ws (WebSocket) |
