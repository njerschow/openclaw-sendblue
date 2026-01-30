/**
 * Type definitions for openclaw-sendblue plugin
 */

// Channel configuration from openclaw.json channels.sendblue
export interface SendblueChannelConfig {
  apiKey: string;
  apiSecret: string;
  phoneNumber: string;
  allowFrom?: string[];
  pollIntervalMs?: number;
  dmPolicy?: 'allowlist' | 'open' | 'disabled';
  // Webhook configuration
  webhook?: {
    enabled: boolean;
    port?: number;        // Default: 3141
    path?: string;        // Default: /webhook/sendblue
    secret?: string;      // Webhook secret for authentication
    rateLimit?: {
      windowMs?: number;    // Rate limit window in ms (default: 60000)
      maxRequests?: number; // Max requests per window (default: 60)
    };
  };
}

// Sendblue API message format
export interface SendblueMessage {
  message_handle: string;
  content: string;
  from_number: string;
  to_number: string;
  number: string;
  status: string;
  date_sent: string;
  date_updated: string;
  created_at?: string;
  is_outbound: boolean;
  media_url?: string;
}

// Conversation message stored in DB
export interface ConversationMessage {
  id: number;
  chat_id: string;
  from_number: string;
  content: string;
  timestamp: number;
  is_outbound: boolean;
}

// Chat summary
export interface ChatInfo {
  chat_id: string;
  last_message?: string;
  last_timestamp?: number;
  message_count: number;
}
