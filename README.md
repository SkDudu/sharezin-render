# sharezin-render

Backend completo com Fastify, TypeScript, Prisma e Supabase, incluindo autenticação, CRUD, API REST e suporte a realtime.

## 🚀 Tecnologias

- **Fastify** - Framework web rápido e eficiente
- **TypeScript** - Tipagem estática
- **Prisma** - ORM moderno para PostgreSQL
- **Supabase** - Backend as a Service (PostgreSQL + Auth + Realtime)
- **WebSocket** - Suporte a conexões em tempo real

## 📋 Pré-requisitos

- Node.js 18+ 
- npm ou yarn
- Conta no Supabase (gratuita)

## 🔧 Configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Database
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres?schema=public"

# Supabase
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Server
PORT=3000
NODE_ENV=development
HOST=0.0.0.0

# CORS (opcional)
CORS_ORIGIN="http://localhost:3000"
```

### 3. Obter credenciais do Supabase

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Crie um novo projeto ou selecione um existente
3. Vá em **Settings > Database**
4. Copie a **Connection string** (URI) e cole como `DATABASE_URL`
5. Vá em **Settings > API**
6. Copie a **URL** do projeto e cole como `SUPABASE_URL`
7. Copie a **anon public** key e cole como `SUPABASE_ANON_KEY`

### 4. Configurar Prisma

Gere o Prisma Client:

```bash
npm run prisma:generate
```

Crie e execute a primeira migração:

```bash
npm run prisma:migrate
```

Isso criará a tabela `users` no banco de dados.

### 5. Iniciar o servidor

Modo desenvolvimento (com hot-reload):

```bash
npm run dev
```

O servidor estará rodando em `http://localhost:3000`

## 📚 Scripts Disponíveis

- `npm run dev` - Inicia o servidor em modo desenvolvimento com hot-reload
- `npm run build` - Compila o TypeScript para JavaScript
- `npm run start` - Inicia o servidor em modo produção
- `npm run prisma:generate` - Gera o Prisma Client
- `npm run prisma:migrate` - Cria e executa migrações do banco de dados
- `npm run prisma:studio` - Abre o Prisma Studio (interface visual do banco)
- `npm run prisma:push` - Faz push do schema para o banco (sem criar migrações)

## 🏗️ Estrutura do Projeto

```
sharezin-render/
├── src/
│   ├── server.ts              # Entry point do servidor
│   ├── config/
│   │   └── database.ts        # Configuração do Prisma Client
│   ├── routes/
│   │   ├── index.ts           # Registro de todas as rotas
│   │   ├── auth.ts            # Rotas de autenticação
│   │   ├── users.ts           # Rotas CRUD de usuários
│   │   └── realtime.ts        # Rotas de WebSocket/Realtime
│   ├── middleware/
│   │   └── auth.ts            # Middleware de autenticação JWT
│   ├── types/
│   │   └── index.ts           # Tipos TypeScript compartilhados
│   └── utils/
│       └── errors.ts          # Handlers de erro customizados
├── prisma/
│   ├── schema.prisma          # Schema do Prisma
│   └── migrations/            # Migrações do banco (geradas)
├── .env                       # Variáveis de ambiente (não versionado)
├── .env.example               # Exemplo de variáveis de ambiente
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## 🔌 Endpoints da API

### Autenticação

- `POST /api/auth/register` - Registrar novo usuário
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe"
  }
  ```

- `POST /api/auth/login` - Fazer login
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

- `POST /api/auth/logout` - Fazer logout (requer Bearer token)

- `GET /api/auth/me` - Obter informações do usuário atual (requer Bearer token)

### Usuários (CRUD)

Todas as rotas de usuários requerem autenticação (Bearer token no header).

- `GET /api/users` - Listar todos os usuários
- `GET /api/users/:id` - Buscar usuário por ID
- `POST /api/users` - Criar novo usuário
  ```json
  {
    "email": "newuser@example.com",
    "name": "New User"
  }
  ```
- `PUT /api/users/:id` - Atualizar usuário
  ```json
  {
    "email": "updated@example.com",
    "name": "Updated Name"
  }
  ```
- `DELETE /api/users/:id` - Deletar usuário

### Realtime

- `WS /api/realtime/ws` - WebSocket endpoint para realtime

**Exemplo de uso do WebSocket:**

```javascript
const ws = new WebSocket('ws://localhost:3000/api/realtime/ws');

// Subscribe to changes in users table
ws.send(JSON.stringify({
  type: 'subscribe',
  table: 'users'
}));

// Listen for changes
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Change received:', data);
};
```

### Health Check

- `GET /health` - Verificar status do servidor

## 🔐 Autenticação

O sistema usa JWT tokens do Supabase para autenticação. Para acessar rotas protegidas, inclua o header:

```
Authorization: Bearer <token>
```

O token é retornado no endpoint de login.

## 🗄️ Banco de Dados

O projeto usa Prisma ORM para gerenciar o banco de dados PostgreSQL do Supabase. 

### Modelo Atual

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Criar Novas Migrações

Após modificar o `schema.prisma`, execute:

```bash
npm run prisma:migrate
```

Isso criará uma nova migração e aplicará as mudanças no banco.

## 🔄 Realtime

O sistema suporta realtime através de WebSockets e Supabase Realtime. Você pode se inscrever em mudanças de qualquer tabela do banco de dados.

## 🛠️ Desenvolvimento

### Adicionar Novas Rotas

1. Crie um novo arquivo em `src/routes/` (ex: `products.ts`)
2. Exporte uma função async que recebe `FastifyInstance`
3. Registre a rota em `src/routes/index.ts`

Exemplo:

```typescript
// src/routes/products.ts
export async function productRoutes(fastify: FastifyInstance) {
  fastify.get('/products', async (request, reply) => {
    // sua lógica aqui
  });
}

// src/routes/index.ts
import { productRoutes } from './products';

await fastify.register(productRoutes, { prefix: '/api/products' });
```

### Adicionar Novos Modelos

1. Adicione o modelo em `prisma/schema.prisma`
2. Execute `npm run prisma:migrate`
3. Use `prisma.modelName` no código

## 📝 Licença

ISC

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues e pull requests.
