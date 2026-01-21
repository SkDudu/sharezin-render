import { FastifyRequest } from 'fastify';

// Authentication
export interface UserPayload {
  id: string;
  email: string;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user?: UserPayload;
}

// User
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

// Participant
export interface Participant {
  id: string;
  name: string;
  groupId?: string;
  userId?: string;
  isClosed?: boolean;
}

// Pending Participant
export interface PendingParticipant {
  id: string;
  name: string;
  requestedAt: string;
  userId: string;
}

// Group
export interface Group {
  id: string;
  name: string;
  participantIds: string[];
}

// Receipt Item
export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  participantId: string;
  addedAt: string;
}

// Deletion Request
export interface DeletionRequest {
  id: string;
  itemId: string;
  participantId: string;
  requestedAt: string;
}

// Receipt
export interface Receipt {
  id: string;
  title: string;
  date: string;
  creatorId: string;
  inviteCode: string;
  participants: Participant[];
  pendingParticipants: PendingParticipant[];
  items: ReceiptItem[];
  deletionRequests: DeletionRequest[];
  serviceChargePercent: number;
  cover: number;
  total: number;
  isClosed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReceiptDto {
  title: string;
  serviceChargePercent?: number;
  cover?: number;
  groupId?: string;
}

export interface UpdateReceiptDto {
  title?: string;
  serviceChargePercent?: number;
  cover?: number;
  isClosed?: boolean;
  total?: number;
  participants?: Participant[];
  pendingParticipants?: PendingParticipant[];
  deletionRequests?: DeletionRequest[];
  items?: ReceiptItem[];
}

export interface RequestJoinDto {
  name?: string;
}

export interface TransferCreatorDto {
  newCreatorParticipantId: string;
}

// Notification
export type NotificationType =
  | 'participant_request'
  | 'participant_approved'
  | 'participant_rejected'
  | 'deletion_request'
  | 'deletion_approved'
  | 'deletion_rejected'
  | 'receipt_closed'
  | 'item_added'
  | 'creator_transferred'
  | 'creator_transferred_from';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  receiptId?: string;
  relatedUserId?: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  receiptId?: string;
  relatedUserId?: string;
}

export interface MarkNotificationsReadDto {
  markAllAsRead?: boolean;
  notificationIds?: string[];
}

// Plan
export interface PlanFeatures {
  dashboard?: boolean;
  analytics?: boolean;
  pdfExport?: boolean;
  excelExport?: boolean;
}

export interface Plan {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  priceMonthly: number;
  maxParticipantsPerReceipt: number | null;
  maxReceiptsPerMonth: number | null;
  maxHistoryReceipts: number | null;
  features: PlanFeatures;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// User Subscription
export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  plan?: Plan;
  status: 'active' | 'cancelled' | 'expired';
  startedAt: string;
  expiresAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubscriptionDto {
  planId: string;
}

export interface CancelSubscriptionDto {
  action: 'cancel';
}

// Dashboard Stats
export interface DashboardStats {
  expensesByPeriod: Array<{
    period: string;
    total: number;
    receiptCount: number;
  }>;
  expensesByDay: Array<{
    day: string;
    total: number;
    receiptCount: number;
  }>;
  expenseDistribution: Array<{
    receiptId: string;
    receiptTitle: string;
    receiptDate: string;
    totalSpent: number;
    isClosed: boolean;
  }>;
}

// Query Params
export interface ListReceiptsQuery {
  includeClosed?: boolean;
  onlyClosed?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListNotificationsQuery {
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface DashboardStatsQuery {
  year?: string;
}
