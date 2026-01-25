/**
 * Type definitions for clawdbot-sendblue plugin
 */

// Channel configuration from clawdbot.json channels.sendblue
export interface SendblueChannelConfig {
  apiKey: string;
  apiSecret: string;
  phoneNumber: string;
  allowFrom?: string[];
  pollIntervalMs?: number;
  dmPolicy?: 'allowlist' | 'open' | 'disabled';
  
  // Webhook configuration (recommended for real-time delivery)
  // Uses Clawdbot's gateway HTTP server - no separate port needed
  webhookPath?: string;      // e.g., '/webhook/sendblue' (enables webhook mode)
  webhookSecret?: string;    // Optional: verify x-sendblue-secret header
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
