/**
 * SQLite database for message deduplication and conversation tracking
 * Simplified version for openclaw adapter
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { ConversationMessage, ChatInfo } from './types.js';

const DB_DIR = path.join(os.homedir(), '.config', 'openclaw-sendblue');
const DB_PATH = path.join(DB_DIR, 'adapter.db');

let db: Database.Database | null = null;

export function initDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  db.exec(`
    -- Track processed message IDs to avoid duplicates
    CREATE TABLE IF NOT EXISTS processed_messages (
      message_id TEXT PRIMARY KEY,
      processed_at INTEGER NOT NULL
    );

    -- Conversation history for chats.list
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      from_number TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      is_outbound INTEGER NOT NULL DEFAULT 0
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_conversations_chat
      ON conversations(chat_id, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_processed_at
      ON processed_messages(processed_at);
  `);

  return db;
}

// --- Processed Messages (Deduplication) ---

export function isMessageProcessed(messageId: string): boolean {
  const database = initDb();
  const row = database.prepare('SELECT 1 FROM processed_messages WHERE message_id = ?').get(messageId);
  return !!row;
}

export function markMessageProcessed(messageId: string): void {
  const database = initDb();
  database.prepare(
    'INSERT OR IGNORE INTO processed_messages (message_id, processed_at) VALUES (?, ?)'
  ).run(messageId, Date.now());
}

/**
 * Atomically check if a message is processed and mark it if not.
 * Returns true if the message was newly marked (should be processed).
 * Returns false if it was already processed (should be skipped).
 * This prevents race conditions in concurrent webhook/polling scenarios.
 */
export function tryMarkMessageProcessed(messageId: string): boolean {
  const database = initDb();
  const result = database.prepare(
    'INSERT OR IGNORE INTO processed_messages (message_id, processed_at) VALUES (?, ?)'
  ).run(messageId, Date.now());
  // changes > 0 means the insert succeeded (message was not already processed)
  return result.changes > 0;
}

export function cleanupOldProcessedMessages(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): void {
  const database = initDb();
  const cutoff = Date.now() - olderThanMs;
  database.prepare('DELETE FROM processed_messages WHERE processed_at < ?').run(cutoff);
}

// --- Conversation History ---

export function addConversationMessage(
  chatId: string,
  fromNumber: string,
  content: string,
  isOutbound: boolean
): void {
  const database = initDb();
  database.prepare(
    'INSERT INTO conversations (chat_id, from_number, content, timestamp, is_outbound) VALUES (?, ?, ?, ?, ?)'
  ).run(chatId, fromNumber, content, Date.now(), isOutbound ? 1 : 0);
}

export function getConversationHistory(
  chatId: string,
  limit: number = 50
): ConversationMessage[] {
  const database = initDb();
  const rows = database.prepare(`
    SELECT id, chat_id, from_number, content, timestamp, is_outbound
    FROM conversations
    WHERE chat_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(chatId, limit) as Array<{
    id: number;
    chat_id: string;
    from_number: string;
    content: string;
    timestamp: number;
    is_outbound: number;
  }>;

  return rows.reverse().map(row => ({
    id: row.id,
    chat_id: row.chat_id,
    from_number: row.from_number,
    content: row.content,
    timestamp: row.timestamp,
    is_outbound: row.is_outbound === 1,
  }));
}

export function getAllChats(): ChatInfo[] {
  const database = initDb();
  const rows = database.prepare(`
    SELECT
      chat_id,
      MAX(content) as last_message,
      MAX(timestamp) as last_timestamp,
      COUNT(*) as message_count
    FROM conversations
    GROUP BY chat_id
    ORDER BY last_timestamp DESC
  `).all() as Array<{
    chat_id: string;
    last_message: string;
    last_timestamp: number;
    message_count: number;
  }>;

  return rows.map(row => ({
    chat_id: row.chat_id,
    last_message: row.last_message,
    last_timestamp: row.last_timestamp,
    message_count: row.message_count,
  }));
}

export function clearConversationHistory(chatId: string): void {
  const database = initDb();
  database.prepare('DELETE FROM conversations WHERE chat_id = ?').run(chatId);
}

// --- Utility ---

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDbPath(): string {
  return DB_PATH;
}
