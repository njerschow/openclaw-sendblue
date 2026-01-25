/**
 * Webhook handler for receiving Sendblue messages in real-time
 * 
 * Integrates with Clawdbot's gateway HTTP server instead of running standalone.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { SendblueMessage } from './types.js';

export interface WebhookHandlerConfig {
  path: string;
  secret?: string;
  onMessage: (message: SendblueMessage) => Promise<void>;
  logger?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
}

let webhookConfig: WebhookHandlerConfig | null = null;

/**
 * Normalize webhook path for consistent matching
 */
function normalizePath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '/webhook/sendblue';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.endsWith('/') && withSlash.length > 1 
    ? withSlash.slice(0, -1) 
    : withSlash;
}

/**
 * Validate that the payload has required SendblueMessage fields
 */
function isValidSendbluePayload(payload: unknown): payload is SendblueMessage {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const obj = payload as Record<string, unknown>;
  return (
    typeof obj.message_handle === 'string' &&
    typeof obj.from_number === 'string' &&
    obj.message_handle.length > 0 &&
    obj.from_number.length > 0
  );
}

/**
 * Parse JSON body from request
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const maxSize = 1024 * 1024; // 1MB limit

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}

/**
 * HTTP request handler for Clawdbot's gateway
 * Returns true if request was handled, false to pass to next handler
 */
export async function handleWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (!webhookConfig) {
    return false; // Webhook not configured
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const path = normalizePath(url.pathname);
  const expectedPath = normalizePath(webhookConfig.path);

  // Check if this request is for us
  if (path !== expectedPath) {
    return false; // Not our endpoint
  }

  const log = webhookConfig.logger || { info: console.log, error: console.error };

  // Only handle POST
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return true;
  }

  // Verify webhook secret if configured
  if (webhookConfig.secret) {
    const providedSecret = req.headers['x-sendblue-secret'] as string | undefined;
    if (providedSecret !== webhookConfig.secret) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid webhook secret' }));
      return true;
    }
  }

  // Parse and validate payload
  let payload: unknown;
  try {
    payload = await parseBody(req);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid request';
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: errorMsg }));
    return true;
  }

  if (!isValidSendbluePayload(payload)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid payload: missing required fields' }));
    return true;
  }

  // Respond 200 OK immediately to prevent Sendblue retries
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ received: true }));

  // Skip outbound messages (our own sends)
  if (payload.is_outbound) {
    return true;
  }

  // Process the message asynchronously
  try {
    log.info(`[Webhook] Received message from ${payload.from_number.slice(-4)}`);
    await webhookConfig.onMessage(payload);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[Webhook] Error processing message: ${errorMsg}`);
  }

  return true;
}

/**
 * Initialize webhook handler configuration
 */
export function initWebhookHandler(config: WebhookHandlerConfig): void {
  webhookConfig = config;
  const log = config.logger || { info: console.log, error: console.error };
  log.info(`[Webhook] Handler registered for path: ${normalizePath(config.path)}`);
}

/**
 * Clear webhook handler configuration
 */
export function clearWebhookHandler(): void {
  webhookConfig = null;
}

/**
 * Check if webhook handler is configured
 */
export function isWebhookConfigured(): boolean {
  return webhookConfig !== null;
}
