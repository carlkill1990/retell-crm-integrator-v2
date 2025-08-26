export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  subscriptionStatus: 'active' | 'cancelled' | 'past_due';
  stripeCustomerId?: string;
  trialEndsAt?: Date;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  errorNotifications: boolean;
  successNotifications: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Account {
  id: string;
  userId: string;
  provider: 'retell' | 'pipedrive' | 'hubspot' | 'salesforce' | 'zoho';
  providerType: 'crm' | 'voice_ai';
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: Date;
  providerAccountId: string;
  accountName?: string;
  accountEmail?: string;
  isActive: boolean;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Integration {
  id: string;
  userId: string;
  name: string;
  description?: string;
  retellAccountId: string;
  crmAccountId: string;
  retellAgentId?: string;
  crmObject?: string;
  isActive: boolean;
  webhookUrl: string;
  webhookSecret: string;
  fieldMappings?: FieldMapping[];
  triggerFilters?: TriggerFilter[];
  callConfiguration?: CallConfiguration;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FieldMapping {
  crmField: string;
  retellField: string;
  transform?: 'none' | 'uppercase' | 'lowercase' | 'phone_format';
  required: boolean;
}

export interface TriggerFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than';
  value: string;
}

export interface CallConfiguration {
  agentId: string;
  phoneNumber?: string;
  customData?: Record<string, any>;
  webhook?: {
    url: string;
    events: string[];
  };
}

export interface SyncEvent {
  id: string;
  userId: string;
  integrationId: string;
  eventType: 'webhook_received' | 'call_triggered' | 'sync_completed' | 'sync_failed';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  sourceData?: any;
  mappedData?: any;
  retellCallId?: string;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookPayload {
  provider: string;
  eventType: string;
  data: any;
  timestamp: string;
  signature?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: number;
  scope?: string;
}