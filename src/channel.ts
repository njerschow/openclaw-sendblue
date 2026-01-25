/**
 * Sendblue Channel Plugin for Clawdbot
 * Implements the clawdbot channel interface for Sendblue iMessage/SMS
 */

import { SendblueClient } from './sendblue.js';
import {
  initDb,
  isMessageProcessed,
  markMessageProcessed,
  addConversationMessage,
  cleanupOldProcessedMessages,
} from './db.js';
import type { SendblueChannelConfig, SendblueMessage } from './types.js';

// Polling state
let pollInterval: NodeJS.Timeout | null = null;
let lastPollTime: Date = new Date(Date.now() - 60 * 1000);
let isPolling = false;
let sendblueClient: SendblueClient | null = null;
let channelConfig: SendblueChannelConfig | null = null;
let clawdbotApi: any = null;

// Logger helper - uses api.logger if available, falls back to console
function log(level: 'info' | 'warn' | 'error', message: string): void {
  const prefix = '[Sendblue]';
  if (clawdbotApi?.logger) {
    clawdbotApi.logger[level](`${prefix} ${message}`);
  } else {
    const fn = level === 'error' ? console.error : console.log;
    fn(`${prefix} ${message}`);
  }
}

/**
 * Start polling for inbound messages
 */
function startPolling(api: any, config: SendblueChannelConfig): void {
  if (pollInterval) {
    log('info', 'Polling already running');
    return;
  }

  clawdbotApi = api;
  channelConfig = config;
  sendblueClient = new SendblueClient({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    phoneNumber: config.phoneNumber,
  });

  initDb();

  const intervalMs = config.pollIntervalMs || 5000;
  log('info', `Starting polling (interval: ${intervalMs}ms)`);
  log('info', `Phone: ${config.phoneNumber}`);
  log('info', `Allowlist: ${config.allowFrom?.join(', ') || '(open)'}`);

  // Initial poll
  poll();

  // Start interval
  pollInterval = setInterval(poll, intervalMs);

  // Cleanup old messages periodically
  setInterval(() => cleanupOldProcessedMessages(), 60 * 60 * 1000);
}

/**
 * Stop polling
 */
function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    log('info', 'Polling stopped');
  }
}

/**
 * Export for service registration
 */
export function startSendblueService(api: any, config: SendblueChannelConfig): void {
  startPolling(api, config);
}

export function stopSendblueService(): void {
  stopPolling();
}

/**
 * Check if a phone number is allowed
 */
function isAllowed(phoneNumber: string): boolean {
  if (!channelConfig?.allowFrom || channelConfig.allowFrom.length === 0) {
    return channelConfig?.dmPolicy !== 'disabled';
  }

  if (channelConfig.dmPolicy === 'disabled') {
    return false;
  }

  if (channelConfig.dmPolicy === 'open') {
    return true;
  }

  // allowlist mode
  const normalize = (num: string) => num.replace(/\D/g, '');
  const normalized = normalize(phoneNumber);
  return channelConfig.allowFrom.some(w => normalize(w) === normalized);
}

/**
 * Poll for new messages
 */
async function poll(): Promise<void> {
  if (isPolling || !sendblueClient) return;

  try {
    isPolling = true;
    const messages = await sendblueClient.getInboundMessages(lastPollTime);
    lastPollTime = new Date();

    for (const msg of messages) {
      await processMessage(msg);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log('error', `Poll error: ${errorMsg}`);
  } finally {
    isPolling = false;
  }
}

/**
 * Process an inbound message
 */
async function processMessage(msg: SendblueMessage): Promise<void> {
  if (isMessageProcessed(msg.message_handle)) return;
  markMessageProcessed(msg.message_handle);

  if (!isAllowed(msg.from_number)) {
    log('info', `Blocked message from ${msg.from_number.slice(-4)}`);
    return;
  }

  const content = msg.content?.trim() || '';
  const mediaUrl = msg.media_url;

  if (!content && !mediaUrl) return;

  // Build message content
  let messageContent = content;
  if (mediaUrl) {
    const mediaNotice = `[Media: ${mediaUrl}]`;
    messageContent = content ? `${content}\n\n${mediaNotice}` : mediaNotice;
  }

  log('info', `Inbound from ${msg.from_number.slice(-4)}: "${messageContent.substring(0, 50)}..."`);

  // Store in conversation history
  addConversationMessage(msg.from_number, msg.from_number, messageContent, false);

  // Emit to clawdbot channel system
  if (clawdbotApi?.emitInbound) {
    clawdbotApi.emitInbound({
      channelId: 'sendblue',
      chatId: msg.from_number,
      from: msg.from_number,
      text: messageContent,
      timestamp: new Date(msg.date_sent).getTime(),
      messageId: msg.message_handle,
      raw: msg,
    });
  }
}

/**
 * Create the Sendblue channel plugin
 */
export function createSendblueChannel(api: any) {
  // Store api reference early for logging
  clawdbotApi = api;

  return {
    // Identity & Metadata
    id: 'sendblue',
    meta: {
      id: 'sendblue',
      label: 'Sendblue',
      selectionLabel: 'iMessage/SMS via Sendblue',
      docsPath: '/channels/sendblue',
      blurb: 'Send and receive iMessages/SMS via Sendblue API',
      aliases: ['imessage', 'sms'],
    },

    // Configuration handlers
    config: {
      listAccountIds: (_cfg: any) => ['default'],
      resolveAccount: (cfg: any, _accountId: string) =>
        cfg.plugins?.entries?.sendblue?.config ?? cfg.channels?.sendblue ?? cfg,
    },

    // Capabilities
    capabilities: {
      chatTypes: ['direct'],
    },

    // Message delivery
    outbound: {
      deliveryMode: 'direct',
      sendText: async ({ text, chatId }: { text: string; chatId: string }) => {
        if (!sendblueClient) {
          log('error', 'Client not initialized');
          return { ok: false, error: 'Client not initialized' };
        }

        try {
          await sendblueClient.sendMessage(chatId, text);
          addConversationMessage(chatId, channelConfig!.phoneNumber, text, true);
          log('info', `Sent to ${chatId.slice(-4)}: "${text.substring(0, 50)}..."`);
          return { ok: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          log('error', `Send error: ${errorMsg}`);
          return { ok: false, error: errorMsg };
        }
      },
    },

    // Gateway adapter for lifecycle
    gateway: {
      start: async (config: SendblueChannelConfig) => {
        log('info', 'Channel starting...');
        startPolling(api, config);
      },
      stop: async () => {
        log('info', 'Channel stopping...');
        stopPolling();
      },
    },
  };
}
