/**
 * Sendblue Channel Plugin for Openclaw
 * Implements the openclaw channel interface for Sendblue iMessage/SMS
 */

import { SendblueClient } from './sendblue.js';
import {
  initDb,
  closeDb,
  tryMarkMessageProcessed,
  addConversationMessage,
  cleanupOldProcessedMessages,
} from './db.js';
import { startWebhookServer, stopWebhookServer } from './webhook.js';
import type { SendblueChannelConfig, SendblueMessage } from './types.js';

// State
let pollInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let lastPollTime: Date = new Date(Date.now() - 60 * 1000);
let isPolling = false;
let sendblueClient: SendblueClient | null = null;
let channelConfig: SendblueChannelConfig | null = null;
let openclawApi: any = null;
let webhookEnabled = false;
let serviceRunning = false;

// Logger helper - uses api.logger if available, falls back to console
function log(level: 'info' | 'warn' | 'error', message: string): void {
  const prefix = '[Sendblue]';
  if (openclawApi?.logger) {
    openclawApi.logger[level](`${prefix} ${message}`);
  } else {
    const fn = level === 'error' ? console.error : console.log;
    fn(`${prefix} ${message}`);
  }
}

/**
 * Initialize the Sendblue service (shared setup for both polling and webhook modes)
 */
function initializeService(api: any, config: SendblueChannelConfig): void {
  openclawApi = api;
  channelConfig = config;
  sendblueClient = new SendblueClient({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    phoneNumber: config.phoneNumber,
  });

  initDb();

  log('info', `Phone: ${config.phoneNumber}`);
  log('info', `Allowlist: ${config.allowFrom?.join(', ') || '(open)'}`);

  // Clear any existing cleanup interval before setting a new one
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  cleanupInterval = setInterval(() => cleanupOldProcessedMessages(), 60 * 60 * 1000);
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
 * Stop all services (polling, webhook, cleanup).
 * Each step is wrapped individually so a failure in one doesn't skip the rest.
 */
async function stopAllServices(): Promise<void> {
  stopPolling();
  isPolling = false;

  if (webhookEnabled) {
    try {
      log('info', 'Stopping webhook server...');
      await stopWebhookServer();
    } catch (e) {
      log('error', `Webhook stop error: ${e instanceof Error ? e.message : String(e)}`);
    }
    webhookEnabled = false;
  }

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  // Close the SQLite database
  try {
    closeDb();
  } catch (e) {
    log('error', `DB close error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Null out client so outbound sends on a stopped service fail cleanly
  sendblueClient = null;
}

/**
 * Export for service registration
 *
 * Idempotent — if the service is already running we skip.  OpenClaw's
 * gateway.startAccount and service.start can both call this; the guard
 * prevents duplicate pollers / webhook servers.
 *
 * The flag is set only after all fallible work completes so a failed start
 * does not permanently lock out retries.
 */
export function startSendblueService(api: any, config: SendblueChannelConfig): void {
  if (serviceRunning) {
    log('info', 'Service already running — skipping duplicate start');
    return;
  }

  initializeService(api, config);

  if (config.webhook?.enabled) {
    startWebhook(config);
    log('info', 'Using webhook mode for real-time messages');
  } else {
    startPolling();
    log('info', 'Using polling mode for messages');
  }

  // Only mark running after all init succeeded — a throw above leaves the
  // flag false so the next call can retry.
  serviceRunning = true;
}

export async function stopSendblueService(): Promise<void> {
  try {
    await stopAllServices();
  } finally {
    serviceRunning = false;
  }
}

/** Allow index.ts to reset the registration guard on full teardown. */
export function resetRegistration(): void {
  // no-op on service state — stopSendblueService handles that.
  // This exists so the register() idempotency flag can be cleared externally.
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

    for (const msg of messages) {
      await processMessage(msg);
    }

    // Advance lastPollTime only after all messages are processed successfully.
    // If processMessage throws mid-batch, we'll re-fetch (dedup DB prevents
    // double-processing of the ones that did succeed).
    lastPollTime = new Date();
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

  // Dispatch to openclaw using the runtime channel reply dispatcher
  const runtime = openclawApi?.runtime;
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
      cfg: openclawApi.config,
      dispatcherOptions: {
        deliver: async (payload: { text?: string; media?: string }) => {
          if (payload.text) {
            await sendblueClient?.sendMessage(msg.from_number, payload.text);
            addConversationMessage(msg.from_number, channelConfig!.phoneNumber, payload.text, true);
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
 * Resolve the Sendblue config from the full OpenClaw config.
 * Checks plugins.entries.sendblue.config first, then channels.sendblue.
 */
function resolveSendblueConfig(cfg: any): SendblueChannelConfig | null {
  return cfg?.plugins?.entries?.sendblue?.config
    ?? cfg?.channels?.sendblue
    ?? null;
}

/**
 * Shared helper to send a message and return OutboundDeliveryResult.
 */
async function sendOutbound(
  to: string,
  text: string,
  mediaUrl?: string,
): Promise<{ channel: string; messageId: string; chatId: string; timestamp: number }> {
  if (!sendblueClient) {
    throw new Error('Client not initialized');
  }

  const result = await sendblueClient.sendMessage(to, text, mediaUrl);
  addConversationMessage(to, channelConfig!.phoneNumber, text, true);
  log('info', `Sent to ${to.slice(-4)}: "${text.substring(0, 50)}..."`);
  return {
    channel: 'sendblue',
    messageId: result?.messageId || `sb-${Date.now()}`,
    chatId: to,
    timestamp: Date.now(),
  };
}

/**
 * Create the Sendblue channel plugin
 */
export function createSendblueChannel(api: any) {
  // Store api reference early for logging
  openclawApi = api;

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

    // Configuration handlers (ChannelConfigAdapter)
    config: {
      listAccountIds: (_cfg: any) => ['default'],
      resolveAccount: (cfg: any, _accountId?: string | null) =>
        resolveSendblueConfig(cfg),
    },

    // Capabilities
    capabilities: {
      chatTypes: ['direct'],
    },

    // Message delivery (ChannelOutboundAdapter)
    // Both sendText and sendMedia are required — OpenClaw guards:
    //   if (!outbound?.sendText || !outbound?.sendMedia) return null;
    outbound: {
      deliveryMode: 'direct',
      sendText: async (ctx: { cfg: any; to: string; text: string; mediaUrl?: string }) => {
        return sendOutbound(ctx.to, ctx.text, ctx.mediaUrl);
      },
      sendMedia: async (ctx: { cfg: any; to: string; text: string; mediaUrl?: string }) => {
        return sendOutbound(ctx.to, ctx.text, ctx.mediaUrl);
      },
    },

    // Gateway adapter (ChannelGatewayAdapter)
    // startAccount/stopAccount receive ChannelGatewayContext:
    //   { cfg, accountId, account (ResolvedAccount), runtime, abortSignal, log, ... }
    gateway: {
      startAccount: async (ctx: any) => {
        log('info', `gateway.startAccount called for account=${ctx?.accountId}`);
        const config = ctx?.account ?? resolveSendblueConfig(ctx?.cfg);
        if (config) {
          startSendblueService(api, config);
        } else {
          log('warn', 'gateway.startAccount: no config resolved');
        }
      },
      stopAccount: async () => {
        log('info', 'Channel stopping...');
        await stopSendblueService();
      },
    },
  };
}
