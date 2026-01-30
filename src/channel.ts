/**
 * Sendblue Channel Plugin for Clawdbot
 * Implements the clawdbot channel interface for Sendblue iMessage/SMS
 */

import { SendblueClient } from './sendblue.js';
import {
  initDb,
  tryMarkMessageProcessed,
  addConversationMessage,
  cleanupOldProcessedMessages,
  upsertOutboundMessageStatus,
  listPendingOutboundStatuses,
} from './db.js';
import { startWebhookServer, stopWebhookServer } from './webhook.js';
import type { SendblueChannelConfig, SendblueMessage } from './types.js';

// State
let pollInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let statusInterval: NodeJS.Timeout | null = null;
let lastPollTime: Date = new Date(Date.now() - 60 * 1000);
let isPolling = false;
let isReconcilingStatus = false;
let sendblueClient: SendblueClient | null = null;
let channelConfig: SendblueChannelConfig | null = null;
let clawdbotApi: any = null;
let webhookEnabled = false;

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
 * Initialize the Sendblue service (shared setup for both polling and webhook modes)
 */
function initializeService(api: any, config: SendblueChannelConfig): void {
  clawdbotApi = api;
  channelConfig = config;
  sendblueClient = new SendblueClient({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    phoneNumber: config.phoneNumber,
  });

  initDb();

  log('info', `Phone: ${config.phoneNumber}`);
  log('info', `Allowlist: ${config.allowFrom?.join(', ') || '(open)'}`);

  // Cleanup old messages periodically
  cleanupInterval = setInterval(() => cleanupOldProcessedMessages(), 60 * 60 * 1000);

  // Reconcile outbound delivery status periodically
  // (Keep this fairly low-frequency to avoid rate limits)
  statusInterval = setInterval(() => reconcileOutboundStatuses(), 20 * 1000);
}

/**
 * Start webhook server for real-time message delivery
 */
function startWebhook(config: SendblueChannelConfig): void {
  const port = config.webhook?.port || 3141;
  const path = config.webhook?.path || '/webhook/sendblue';

  log('info', `Starting webhook server on port ${port}`);

  startWebhookServer({
    port,
    path,
    secret: config.webhook?.secret,
    rateLimit: config.webhook?.rateLimit,
    onMessage: processMessage,
    logger: {
      info: (msg) => log('info', msg),
      error: (msg) => log('error', msg),
    },
  });

  webhookEnabled = true;
}

/**
 * Start polling for inbound messages
 */
function startPolling(): void {
  if (pollInterval) {
    log('info', 'Polling already running');
    return;
  }

  const intervalMs = channelConfig?.pollIntervalMs || 5000;
  log('info', `Starting polling (interval: ${intervalMs}ms)`);

  // Initial poll
  poll();

  // Start interval
  pollInterval = setInterval(poll, intervalMs);
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
 * Stop all services (polling, webhook, cleanup)
 */
async function stopAllServices(): Promise<void> {
  stopPolling();

  if (webhookEnabled) {
    log('info', 'Stopping webhook server...');
    await stopWebhookServer();
    webhookEnabled = false;
  }

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}

/**
 * Export for service registration
 */
export function startSendblueService(api: any, config: SendblueChannelConfig): void {
  initializeService(api, config);

  if (config.webhook?.enabled) {
    startWebhook(config);
    log('info', 'Using webhook mode for real-time messages');
  } else {
    startPolling();
    log('info', 'Using polling mode for messages');
  }
}

export async function stopSendblueService(): Promise<void> {
  await stopAllServices();
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
  // Validate required fields
  if (!msg.message_handle || !msg.from_number) {
    log('error', 'Invalid message: missing message_handle or from_number');
    return;
  }

  // Atomic deduplication - prevents race conditions with concurrent webhooks/polling
  if (!tryMarkMessageProcessed(msg.message_handle)) {
    return; // Already processed
  }

  const fromNumberDisplay = msg.from_number.slice(-4);

  if (!isAllowed(msg.from_number)) {
    log('info', `Blocked message from ${fromNumberDisplay}`);
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

  log('info', `Inbound from ${fromNumberDisplay}: "${messageContent.substring(0, 50)}..."`);

  // Mark message as read
  try {
    await sendblueClient?.markRead(msg.from_number);
  } catch (e) {
    // Non-critical, continue processing
  }

  // Store in conversation history
  addConversationMessage(msg.from_number, msg.from_number, messageContent, false);

  // Dispatch to clawdbot using the runtime channel reply dispatcher
  const runtime = clawdbotApi?.runtime;
  if (!runtime?.channel?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
    log('error', 'dispatchReplyWithBufferedBlockDispatcher not available');
    return;
  }

  const shortId = msg.message_handle.slice(-8);
  const timestamp = new Date(msg.date_sent).getTime();

  const ctxPayload = {
    Body: messageContent,
    BodyForAgent: messageContent,
    RawBody: msg.content || '',
    From: `sendblue:${msg.from_number}`,
    To: `sendblue:${channelConfig?.phoneNumber}`,
    SessionKey: `sendblue:${msg.from_number}`,
    AccountId: 'default',
    ChatType: 'direct',
    SenderId: msg.from_number,
    SenderName: msg.from_number,
    MessageSid: shortId,
    MessageSidFull: msg.message_handle,
    Timestamp: timestamp,
    Provider: 'sendblue',
    Surface: 'sms',
    OriginatingChannel: 'sendblue',
    MediaUrl: mediaUrl || undefined,
  };

  try {
    await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: clawdbotApi.config,
      dispatcherOptions: {
        deliver: async (payload: { text?: string; media?: string }) => {
          const text = payload.text ?? '';
          const media = payload.media;

          // If the agent produced media, upload+send it.
          if (media) {
            const result = await sendblueClient?.sendMessageWithAttachment(msg.from_number, text, {
              url: media,
            });

            if (result?.messageId) {
              upsertOutboundMessageStatus({
                messageHandle: result.messageId,
                chatId: msg.from_number,
                status: 'sent',
                isTerminal: false,
              });
            }

            addConversationMessage(
              msg.from_number,
              channelConfig!.phoneNumber,
              text ? `${text}\n\n[Media: ${media}]` : `[Media: ${media}]`,
              true
            );

            log('info', `Reply (media) sent to ${fromNumberDisplay}`);
            return;
          }

          // Otherwise send plain text.
          if (text) {
            const result = await sendblueClient?.sendMessage(msg.from_number, text);

            if (result?.messageId) {
              upsertOutboundMessageStatus({
                messageHandle: result.messageId,
                chatId: msg.from_number,
                status: 'sent',
                isTerminal: false,
              });
            }

            addConversationMessage(msg.from_number, channelConfig!.phoneNumber, text, true);
            log('info', `Reply sent to ${fromNumberDisplay}`);
          }
        },
        onReplyStart: async () => {
          log('info', 'Agent starting reply...');
          try {
            await sendblueClient?.sendTypingIndicator(msg.from_number);
          } catch (e) {
            // Non-critical, continue
          }
        },
        onIdle: async () => {
          log('info', 'Agent idle');
        },
        onError: (err: Error) => {
          log('error', `Dispatch error: ${err.message}`);
        },
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log('error', `Failed to dispatch message: ${errorMsg}`);
  }
}

/**
 * Create the Sendblue channel plugin
 */
function isTerminalSendblueStatus(status: string): boolean {
  const s = (status || '').toLowerCase();
  // We don't have official enumerations here; treat common terminal states as terminal.
  return (
    s === 'delivered' ||
    s === 'read' ||
    s === 'failed' ||
    s === 'undelivered' ||
    s === 'canceled' ||
    s === 'cancelled'
  );
}

async function reconcileOutboundStatuses(): Promise<void> {
  if (isReconcilingStatus || !sendblueClient) return;

  try {
    isReconcilingStatus = true;

    const pending = listPendingOutboundStatuses(25);
    if (pending.length === 0) return;

    for (const row of pending) {
      try {
        const status = await sendblueClient.getMessageStatus(row.message_handle);
        const terminal = isTerminalSendblueStatus(status);

        // Only log when it changes.
        if (status && status !== row.status) {
          log('info', `Status ${row.message_handle.slice(-8)}: ${row.status} -> ${status}`);
        }

        upsertOutboundMessageStatus({
          messageHandle: row.message_handle,
          chatId: row.chat_id,
          status: status || row.status,
          isTerminal: terminal,
          lastChecked: Date.now(),
        });
      } catch (e) {
        // Don't mark terminal; just update last_checked so we don't tight-loop on failures.
        upsertOutboundMessageStatus({
          messageHandle: row.message_handle,
          chatId: row.chat_id,
          status: row.status,
          isTerminal: false,
          lastChecked: Date.now(),
        });
      }
    }
  } finally {
    isReconcilingStatus = false;
  }
}

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
          const result = await sendblueClient.sendMessage(chatId, text);

          if (result?.messageId) {
            upsertOutboundMessageStatus({
              messageHandle: result.messageId,
              chatId,
              status: 'sent',
              isTerminal: false,
            });
          }

          addConversationMessage(chatId, channelConfig!.phoneNumber, text, true);
          log('info', `Sent to ${chatId.slice(-4)}: "${text.substring(0, 50)}..."`);
          return { ok: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          log('error', `Send error: ${errorMsg}`);
          return { ok: false, error: errorMsg };
        }
      },

      // OpenClaw's outbound delivery expects sendMedia to exist.
      // We accept a mediaUrl (usually http(s)://...) then upload it to Sendblue.
      sendMedia: async ({
        text,
        chatId,
        mediaUrl,
      }: {
        text: string;
        chatId: string;
        mediaUrl: string;
      }) => {
        if (!sendblueClient) {
          log('error', 'Client not initialized');
          return { ok: false, error: 'Client not initialized' };
        }

        try {
          const result = await sendblueClient.sendMessageWithAttachment(chatId, text ?? '', {
            url: mediaUrl,
          });

          if (result?.messageId) {
            upsertOutboundMessageStatus({
              messageHandle: result.messageId,
              chatId,
              status: 'sent',
              isTerminal: false,
            });
          }

          const stored = text ? `${text}\n\n[Media: ${mediaUrl}]` : `[Media: ${mediaUrl}]`;
          addConversationMessage(chatId, channelConfig!.phoneNumber, stored, true);
          log('info', `Sent media to ${chatId.slice(-4)}`);
          return { ok: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          log('error', `Send media error: ${errorMsg}`);
          return { ok: false, error: errorMsg };
        }
      },
    },

    // Gateway adapter for lifecycle
    gateway: {
      start: async (...args: any[]) => {
        log('info', `gateway.start called with ${args.length} args`);
        const config = args[0] as SendblueChannelConfig;
        startSendblueService(api, config);
      },
      stop: async () => {
        log('info', 'Channel stopping...');
        await stopSendblueService();
      },
    },
  };
}
