# Guia de Deploy no Render

## Configuração no Render

### 1. Criar novo Web Service

1. Acesse o [Render Dashboard](https://dashboard.render.com)
2. Clique em "New +" → "Web Service"
3. Conecte seu repositório Git

### 2. Configurações do Build

- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Environment**: `Node`

### 3. Variáveis de Ambiente

Configure as seguintes variáveis de ambiente no Render:

```
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres?schema=public&sslmode=require
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-secret-key-change-this
CORS_ORIGIN=https://your-frontend-domain.com
```

**Importante**: 
- O Render define automaticamente a variável `PORT`, mas você pode usar `10000` como padrão
- Certifique-se de que a `DATABASE_URL` inclui `?sslmode=require` para conexão SSL

### 4. Build Settings

O Render executará automaticamente:
1. `npm install` - Instala dependências (incluindo Prisma)
2. `postinstall` - Gera o Prisma Client automaticamente
3. `npm run build` - Compila TypeScript e gera Prisma Client novamente (garantia)
4. `npm start` - Inicia o servidor

### 5. Verificações

Após o deploy, verifique:
- Health check: `https://your-app.onrender.com/health`
- Logs no Render Dashboard para verificar se há erros

## Troubleshooting

### Erro: "Cannot find module '.prisma/client/default'"

**Solução**: Certifique-se de que:
1. O `prisma` está em `dependencies` (não `devDependencies`)
2. O script `postinstall` está configurado no `package.json`
3. O build command inclui `prisma generate`

### Erro de conexão com banco

**Solução**: 
- Verifique se a `DATABASE_URL` está correta
- Certifique-se de incluir `?sslmode=require` na URL
- Use o pooler session mode se necessário: `postgres://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require`

### Porta não configurada

**Solução**: O Render define automaticamente a variável `PORT`. O código já está configurado para usar `process.env.PORT || '3000'`, então deve funcionar automaticamente.

## Estrutura de Arquivos Importantes

- `package.json` - Scripts de build e start
- `render.yaml` - Configuração opcional do Render (se usar Blueprint)
- `prisma.config.ts` - Configuração do Prisma 7
- `prisma/schema.prisma` - Schema do banco de dados
