/**
 * Webhook server for receiving Sendblue messages in real-time
 */

import http from 'http';
import type { SendblueMessage } from './types.js';

// Maximum request body size (1MB)
const MAX_BODY_SIZE = 1024 * 1024;

// --- Rate Limiter ---

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

class InMemoryRateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(windowMs: number = 60000, maxRequests: number = 60) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    // Clean up old entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const entry = this.requests.get(identifier);

    if (!entry || now - entry.windowStart > this.windowMs) {
      // New window
      this.requests.set(identifier, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests) {
      if (now - entry.windowStart > this.windowMs) {
        this.requests.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.requests.clear();
  }
}

// --- Webhook Server ---

export interface WebhookServerConfig {
  port: number;
  path: string;
  secret?: string;
  rateLimit?: {
    windowMs?: number;
    maxRequests?: number;
  };
  onMessage: (message: SendblueMessage) => Promise<void>;
  logger?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
}

let server: http.Server | null = null;
let rateLimiter: InMemoryRateLimiter | null = null;

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
 * Verify webhook secret from request headers
 * Sendblue may use different header names - we check common ones
 */
function verifySecret(req: http.IncomingMessage, expectedSecret: string): boolean {
  const headers = req.headers;

  // Check common webhook secret header names
  const providedSecret =
    headers['x-sendblue-secret'] ||
    headers['x-webhook-secret'] ||
    headers['x-api-key'] ||
    headers['authorization'];

  if (typeof providedSecret === 'string') {
    // Handle "Bearer <token>" format
    const token = providedSecret.startsWith('Bearer ')
      ? providedSecret.slice(7)
      : providedSecret;
    return token === expectedSecret;
  }

  return false;
}

/**
 * Start the webhook server
 */
export function startWebhookServer(config: WebhookServerConfig): void {
  const { port, path, secret, rateLimit: rateLimitConfig, onMessage, logger } = config;
  const log = logger || { info: console.log, error: console.error };

  if (server) {
    log.info('[Webhook] Server already running');
    return;
  }

  // Initialize rate limiter
  rateLimiter = new InMemoryRateLimiter(
    rateLimitConfig?.windowMs || 60000,
    rateLimitConfig?.maxRequests || 60
  );

  server = http.createServer((req, res) => {
    const clientIP = req.socket.remoteAddress || 'unknown';

    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Only handle POST requests to the webhook path
    if (req.method !== 'POST' || !req.url?.startsWith(path)) {
      res.writeHead(404);
      res.end();
      return;
    }

    // Rate limiting
    if (!rateLimiter!.isAllowed(clientIP)) {
      log.error(`[Webhook] Rate limit exceeded for ${clientIP}`);
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': '60',
      });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }

    // Secret verification (if configured)
    if (secret && !verifySecret(req, secret)) {
      log.error(`[Webhook] Invalid or missing secret from ${clientIP}`);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Collect request body with size limit
    let body = '';
    let bodyTooLarge = false;

    req.on('data', (chunk: Buffer) => {
      if (bodyTooLarge) return;

      body += chunk.toString();
      if (body.length > MAX_BODY_SIZE) {
        bodyTooLarge = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('error', (err) => {
      log.error(`[Webhook] Request error: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    });

    req.on('end', async () => {
      if (bodyTooLarge || res.headersSent) return;

      // Parse and validate JSON before responding
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      // Validate required fields
      if (!isValidSendbluePayload(payload)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid payload: missing required fields' }));
        return;
      }

      // Respond 200 OK - payload is valid, we'll process it
      // This prevents Sendblue from retrying
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));

      // Only process inbound messages
      if (payload.is_outbound) {
        return;
      }

      try {
        log.info(`[Webhook] Received message from ${payload.from_number.slice(-4)}`);
        await onMessage(payload);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(`[Webhook] Error processing message: ${errorMsg}`);
      }
    });
  });

  server.listen(port, () => {
    log.info(`[Webhook] Server listening on port ${port}`);
    log.info(`[Webhook] Endpoint: http://localhost:${port}${path}`);
    if (secret) {
      log.info('[Webhook] Secret verification enabled');
    }
    log.info(`[Webhook] Rate limit: ${rateLimitConfig?.maxRequests || 60} req/${(rateLimitConfig?.windowMs || 60000) / 1000}s`);
  });

  server.on('error', (error) => {
    log.error(`[Webhook] Server error: ${error.message}`);
  });
}

/**
 * Stop the webhook server
 */
export function stopWebhookServer(): Promise<void> {
  return new Promise((resolve) => {
    if (rateLimiter) {
      rateLimiter.destroy();
      rateLimiter = null;
    }

    if (!server) {
      resolve();
      return;
    }

    server.close(() => {
      server = null;
      resolve();
    });
  });
}

/**
 * Check if webhook server is running
 */
export function isWebhookServerRunning(): boolean {
  return server !== null;
}
