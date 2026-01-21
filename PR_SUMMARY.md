# Implementação de Rotas de Recibos

## 📋 Resumo

Esta PR implementa todas as rotas de recibos conforme especificado no contrato da API (`api-contract.json`), incluindo CRUD completo, gerenciamento de participantes, itens, notificações e estatísticas do dashboard.

## ✨ Funcionalidades Implementadas

### Rotas de Recibos (`/api/receipts`)

#### Rotas Básicas
- ✅ `GET /api/receipts` - Lista todos os recibos do usuário (criador ou participante)
  - Suporta filtros: `includeClosed`, `onlyClosed`, `limit`, `offset`
  - Aplica limite de histórico baseado no plano do usuário
- ✅ `GET /api/receipts/:id` - Busca recibo por ID
  - Verifica permissões (criador ou participante)
- ✅ `GET /api/receipts/invite/:inviteCode` - Busca recibo por código de convite
  - Não requer autenticação (acesso público)
- ✅ `POST /api/receipts` - Cria novo recibo
  - Valida limite de recibos do plano
  - Gera código de convite único
  - Adiciona criador como participante automaticamente
  - Suporta adicionar participantes de um grupo

#### Rotas de Atualização
- ✅ `PUT /api/receipts/:id` - Atualiza recibo existente
  - Criador pode modificar: título, taxa de serviço, cover, status
  - Participantes podem adicionar itens
  - Recalcula total automaticamente
  - Cria notificações para novos itens
- ✅ `DELETE /api/receipts/:id` - Deleta recibo (apenas criador)
- ✅ `POST /api/receipts/:id/close` - Fecha recibo (apenas criador)
  - Calcula totais finais
  - Cria registros em `user_receipt_expenses` para cada participante
  - Notifica todos os participantes

#### Rotas de Participantes
- ✅ `POST /api/receipts/:id/request-join` - Solicita entrada em recibo
  - Cria solicitação pendente
  - Notifica criador
- ✅ `PUT /api/receipts/:id/transfer-creator` - Transfere criador para outro participante
  - Valida permissões e estado do recibo
  - Notifica novo e antigo criador
- ✅ `DELETE /api/receipts/:id/participants/:participantId` - Remove participante (apenas criador)
  - Remove todos os itens do participante
  - Recalcula total
- ✅ `POST /api/receipts/:id/participants/:participantId/close` - Fecha participação
  - Permite que participante ou criador feche participação
- ✅ `GET /api/receipts/:id/participants/user-ids` - Retorna user IDs dos participantes

#### Estatísticas
- ✅ `GET /api/receipts/dashboard-stats` - Estatísticas do dashboard
  - Gastos por período (mês)
  - Gastos por dia
  - Distribuição de gastos
  - Filtro por ano (opcional)

## 🗂️ Arquivos Criados

### Utilitários
- **`src/utils/receipts.ts`**
  - `generateInviteCode()` - Gera código único de 6-8 caracteres
  - `calculateReceiptTotal()` - Calcula total (itens + taxa + cover)
  - `formatReceiptResponse()` - Formata resposta do Prisma para API
  - `checkReceiptAccess()` - Verifica acesso ao recibo
  - `recalculateReceiptTotal()` - Recalcula e atualiza total no banco

- **`src/utils/plans.ts`**
  - `getUserActivePlan()` - Busca plano ativo do usuário
  - `checkReceiptLimit()` - Verifica limite de recibos por mês
  - `checkParticipantLimit()` - Verifica limite de participantes por recibo
  - `checkHistoryLimit()` - Verifica limite de histórico ao listar recibos fechados
  - `getUserPlanLimits()` - Retorna todos os limites do plano

- **`src/utils/notifications.ts`**
  - `createNotification()` - Cria notificação no banco
  - `notifyReceiptClosed()` - Notifica participantes quando recibo fecha
  - `notifyItemAdded()` - Notifica quando item é adicionado
  - `notifyParticipantRequest()` - Notifica criador sobre solicitação
  - `notifyCreatorTransferred()` - Notifica transferência de criador
  - `notifyParticipantApproved()` - Notifica aprovação de participante
  - `notifyParticipantRejected()` - Notifica rejeição de participante

### Middleware
- **`src/middleware/receipt-permissions.ts`**
  - `checkIsCreator()` - Verifica se usuário é criador
  - `checkIsParticipant()` - Verifica se usuário é participante
  - `checkReceiptNotClosed()` - Verifica se recibo não está fechado
  - `checkIsCreatorAndNotClosed()` - Middleware combinado
  - `checkIsParticipantAndNotClosed()` - Middleware combinado

### Rotas
- **`src/routes/receipts.ts`**
  - Implementa todas as 13 rotas de recibos
  - Integração com utilitários e middleware
  - Tratamento de erros padronizado
  - Validações de permissões e limites

## 🔧 Arquivos Modificados

- **`src/routes/index.ts`**
  - Registra rotas de receipts com prefixo `/api/receipts`

## 🎯 Funcionalidades Principais

### Sistema de Permissões
- **Criador**: Pode modificar recibo, fechar, deletar, adicionar/remover participantes, transferir criador
- **Participante**: Pode adicionar itens, solicitar entrada, ver recibo
- **Público**: Pode ver recibo por invite code (sem autenticação)

### Integração com Planos
- Verificação de limite de recibos por mês
- Verificação de limite de participantes por recibo
- Limite de histórico ao listar recibos fechados
- Suporte a planos ilimitados (null = sem limite)

### Sistema de Notificações
- Notificações automáticas para:
  - Fechamento de recibo
  - Adição de itens
  - Solicitações de participação
  - Transferência de criador
  - Aprovação/rejeição de participantes

### Cálculo Automático de Totais
- Total calculado automaticamente baseado em:
  - Soma dos itens (quantidade × preço)
  - Taxa de serviço (percentual)
  - Cover (valor fixo)
- Recalcula sempre que itens são adicionados/removidos

### Suporte a Grupos
- Ao criar recibo com `groupId`, adiciona automaticamente todos os participantes do grupo
- Criador é sempre adicionado como participante

### Dashboard Stats
- Agrupa despesas por período (mês) e por dia
- Distribuição de gastos por recibo
- Filtro por ano
- Retorna apenas recibos fechados

## 🔒 Segurança e Validações

- ✅ Autenticação JWT obrigatória (exceto invite code)
- ✅ Verificação de permissões em todas as rotas
- ✅ Validação de limites de plano
- ✅ Validação de estado do recibo (fechado/aberto)
- ✅ Transações Prisma para operações complexas
- ✅ Tratamento de erros padronizado
- ✅ Validação de dados de entrada

## 📊 Códigos de Status HTTP

- `200` - Sucesso
- `201` - Criado com sucesso
- `204` - Sem conteúdo (delete)
- `400` - Bad Request (validação)
- `401` - Unauthorized (não autenticado)
- `403` - Forbidden (sem permissão ou limite atingido)
- `404` - Not Found (recurso não encontrado)
- `500` - Internal Server Error

## 🧪 Testes Recomendados

1. Criar recibo com e sem grupo
2. Adicionar itens como participante
3. Fechar recibo e verificar notificações
4. Solicitar entrada e aprovar
5. Transferir criador
6. Verificar limites de plano
7. Dashboard stats com diferentes anos
8. Remover participante e verificar recálculo de total

## 📝 Notas Técnicas

- Invite codes são únicos e gerados automaticamente
- Totais são recalculados sempre que itens mudam
- Notificações são criadas de forma assíncrona (não bloqueiam resposta)
- Transações Prisma garantem consistência em operações complexas
- Conversão de tipos Decimal para Number onde necessário
- Tratamento de valores null/undefined em todos os campos

## ✅ Checklist

- [x] Todas as rotas implementadas conforme contrato
- [x] Validações de permissões implementadas
- [x] Integração com sistema de planos
- [x] Sistema de notificações funcional
- [x] Cálculo automático de totais
- [x] Suporte a grupos
- [x] Dashboard stats implementado
- [x] Tratamento de erros padronizado
- [x] TypeScript sem erros
- [x] Build passando

## 🚀 Próximos Passos

- [ ] Implementar cache para dashboard stats (5 minutos)
- [ ] Adicionar testes unitários
- [ ] Adicionar testes de integração
- [ ] Documentar exemplos de uso
- [ ] Implementar rotas de notificações (se necessário)
