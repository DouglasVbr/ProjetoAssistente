/**
 * SQLite Database Service - Capacitor SQLite implementation
 */

import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { IMemoryRepository, IChatRepository, ISettingsRepository, ISyncRepository, IStorageService } from '@domain/repositories';
import type { Memory, ChatMessage, AppSettings, SyncStatus } from '@domain/entities';
import { DatabaseError } from '@core/errors';
import { generateId } from '@core/utils';

const DB_NAME = 'phennellopy.db';
const DB_VERSION = 1;

const SCHEMA = `
-- Memories table with vector embeddings support
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  question_text TEXT NOT NULL,
  question_voice TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  answer_voice TEXT NOT NULL,
  embeddings BLOB,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_memories_question_text ON memories(question_text);
CREATE INDEX IF NOT EXISTS idx_memories_synced ON memories(synced);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  audio_url TEXT,
  metadata TEXT,
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_chats_timestamp ON chats(timestamp);
CREATE INDEX IF NOT EXISTS idx_chats_session_id ON chats(session_id);

-- Settings table (single row)
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sync queue table
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity, entity_id);
`;

interface SqliteResult {
  values?: Array<Record<string, unknown>>;
  changes?: { changes?: number; lastId?: number };
}

// Note: this class only formally `implements` IMemoryRepository and
// IStorageService, the two contracts whose method names don't collide with
// each other. IChatRepository, ISettingsRepository and ISyncRepository all
// reuse generic names (findAll/findById/create/update/delete) that a single
// class can't also implement for a *different* entity type (Memory vs
// ChatMessage vs AppSettings) without name clashes — TypeScript rejects two
// methods named `findAll` with different signatures in one class. The chat/
// settings/sync methods below still exist and work (entity-specific names:
// findAllChats, getSettings, getSyncStatus, ...); they just aren't declared
// against those interfaces. If/when ChatRepository, SettingsRepository and
// SyncRepository get wired into the DI container (see core/di), give them
// their own classes (sharing the same underlying connection) instead of
// bolting more `implements` onto this one.
export class SQLiteService implements IMemoryRepository, IStorageService {
  private sqlite: SQLiteConnection | null = null;
  private db: any = null;
  private initialized = false;

  // ========== Init / teardown ==========

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.sqlite = new SQLiteConnection(CapacitorSQLite);

      if (Capacitor.isNativePlatform()) {
        await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);
        this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
        await this.db.open();
      } else {
        console.warn('SQLite not available on web, using IndexedDB fallback');
      }

      await this.runMigrations();
      this.initialized = true;
    } catch (error) {
      throw new DatabaseError('Failed to initialize database', error as Error);
    }
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) return;

    const statements = SCHEMA.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await this.db.execute(statement.trim());
      }
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  // ========== Helpers ==========

  private ensureDb(): any {
    if (!this.db || !this.initialized) {
      throw new DatabaseError('Database not initialized');
    }
    return this.db;
  }

  private mapRowToMemory(row: Record<string, unknown>): Memory {
    return {
      id: row.id as string,
      questionText: row.question_text as string,
      questionVoice: row.question_voice as string,
      answerText: row.answer_text as string,
      answerVoice: row.answer_voice as string,
      embeddings: row.embeddings ? this.blobToArray(row.embeddings as ArrayBuffer) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      createdAt: new Date(row.created_at as number),
      updatedAt: new Date(row.updated_at as number),
      synced: Boolean(row.synced),
    };
  }

  private mapRowToChatMessage(row: Record<string, unknown>): ChatMessage {
    return {
      id: row.id as string,
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content as string,
      timestamp: new Date(row.timestamp as number),
      audioUrl: row.audio_url as string | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }

  private getDefaultSettings(): AppSettings {
    return {
      id: 'default',
      aiProvider: 'openai',
      aiModelConfig: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 2000,
        topP: 1,
        presencePenalty: 0,
        frequencyPenalty: 0,
      },
      voiceSettings: {
        language: 'pt-BR',
        rate: 0.75,
        pitch: 1.0,
        volume: 1.0,
        recognitionLanguage: 'pt-BR',
        continuousRecognition: true,
        interimResults: true,
      },
      theme: 'dark',
      language: 'pt-BR',
      wakeWordEnabled: true,
      wakeWord: 'phennellopy',
      autoSpeak: true,
      offlineMode: false,
      syncEnabled: true,
      syncInterval: 15,
      dataRetentionDays: 365,
      notificationsEnabled: true,
      hapticsEnabled: true,
      updatedAt: new Date(),
    };
  }

  private arrayToBlob(arr: number[]): ArrayBuffer {
    const buffer = new ArrayBuffer(arr.length * 4);
    const view = new Float32Array(buffer);
    view.set(arr);
    return buffer;
  }

  private blobToArray(buffer: ArrayBuffer): number[] {
    return Array.from(new Float32Array(buffer));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private getChanges(result: any): number {
    if (!result?.changes) return 0;
    return typeof result.changes === 'number' ? result.changes : (result.changes?.changes ?? 0);
  }

  // ========== IMemoryRepository ==========

  async findAll(): Promise<Memory[]> {
    const db = this.ensureDb();
    const result = await db.query('SELECT * FROM memories ORDER BY created_at DESC');
    return (result.values || []).map(this.mapRowToMemory);
  }

  async findById(id: string): Promise<Memory | null> {
    const db = this.ensureDb();
    const result = await db.query('SELECT * FROM memories WHERE id = ?', [id]);
    if (!result.values?.length) return null;
    return this.mapRowToMemory(result.values[0]);
  }

  async findByQuestionText(text: string): Promise<Memory[]> {
    const db = this.ensureDb();
    const result = await db.query(
      'SELECT * FROM memories WHERE question_text LIKE ? ORDER BY created_at DESC',
      [`%${text}%`]
    );
    return (result.values || []).map(this.mapRowToMemory);
  }

  async searchByEmbedding(embedding: number[], limit: number = 10, threshold: number = 0.7): Promise<Memory[]> {
    const all = await this.findAll();
    return all
      .filter(m => m.embeddings && m.embeddings.length === embedding.length)
      .map(m => ({
        memory: m,
        similarity: this.cosineSimilarity(embedding, m.embeddings!),
      }))
      .filter(r => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(r => r.memory);
  }

  async create(data: Omit<Memory, 'id' | 'createdAt' | 'updatedAt' | 'synced'>): Promise<Memory> {
    const db = this.ensureDb();
    const id = generateId();
    const embeddingsBlob = data.embeddings ? this.arrayToBlob(data.embeddings) : null;

    await db.run(
      `INSERT INTO memories (id, question_text, question_voice, answer_text, answer_voice, embeddings, metadata, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.questionText,
        data.questionVoice,
        data.answerText,
        data.answerVoice,
        embeddingsBlob,
        JSON.stringify(data.metadata || {}),
        Date.now(),
        Date.now(),
        0,
      ]
    );

    const created = await this.findById(id);
    if (!created) throw new DatabaseError('Failed to create memory');
    return created;
  }

  async update(id: string, data: Partial<Memory>): Promise<Memory | null> {
    const db = this.ensureDb();
    const existing = await this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.questionText !== undefined) { updates.push('question_text = ?'); values.push(data.questionText); }
    if (data.questionVoice !== undefined) { updates.push('question_voice = ?'); values.push(data.questionVoice); }
    if (data.answerText !== undefined) { updates.push('answer_text = ?'); values.push(data.answerText); }
    if (data.answerVoice !== undefined) { updates.push('answer_voice = ?'); values.push(data.answerVoice); }
    if (data.embeddings !== undefined) {
      updates.push('embeddings = ?');
      values.push(data.embeddings ? this.arrayToBlob(data.embeddings) : null);
    }
    if (data.metadata !== undefined) { updates.push('metadata = ?'); values.push(JSON.stringify(data.metadata)); }

    updates.push('updated_at = ?'); values.push(Date.now());
    updates.push('synced = ?'); values.push(0);

    values.push(id);

    await db.run(`UPDATE memories SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const db = this.ensureDb();
    const result = await db.run('DELETE FROM memories WHERE id = ?', [id]);
    return this.getChanges(result) > 0;
  }

  async deleteAll(): Promise<number> {
    const db = this.ensureDb();
    const result = await db.run('DELETE FROM memories');
    return this.getChanges(result);
  }

  async count(): Promise<number> {
    const db = this.ensureDb();
    const result = await db.query('SELECT COUNT(*) as count FROM memories');
    return (result.values?.[0]?.count as number) || 0;
  }

  async getUnsynced(): Promise<Memory[]> {
    const db = this.ensureDb();
    const result = await db.query('SELECT * FROM memories WHERE synced = 0 ORDER BY created_at ASC');
    return (result.values || []).map(this.mapRowToMemory);
  }

  async markSynced(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = this.ensureDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`UPDATE memories SET synced = 1 WHERE id IN (${placeholders})`, ids);
  }

  // ========== Chat messages (entity-specific names — see class comment) ==========

  async findAllChats(sessionId?: string): Promise<ChatMessage[]> {
    const db = this.ensureDb();
    let query = 'SELECT * FROM chats';
    const params: unknown[] = [];

    if (sessionId) {
      query += ' WHERE session_id = ?';
      params.push(sessionId);
    }

    query += ' ORDER BY timestamp ASC';
    const result = await db.query(query, params);
    return (result.values || []).map(this.mapRowToChatMessage);
  }

  async findChatById(id: string): Promise<ChatMessage | null> {
    const db = this.ensureDb();
    const result = await db.query('SELECT * FROM chats WHERE id = ?', [id]);
    if (!result.values?.length) return null;
    return this.mapRowToChatMessage(result.values[0]);
  }

  async createChat(data: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage> {
    const db = this.ensureDb();
    const id = generateId();
    const timestamp = Date.now();

    await db.run(
      `INSERT INTO chats (id, role, content, timestamp, audio_url, metadata, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.role,
        data.content,
        timestamp,
        data.audioUrl || null,
        JSON.stringify(data.metadata || {}),
        data.metadata?.sessionId || null,
      ]
    );

    const created = await this.findChatById(id);
    if (!created) throw new DatabaseError('Failed to create chat message');
    return created;
  }

  async updateChat(id: string, data: Partial<ChatMessage>): Promise<ChatMessage | null> {
    const db = this.ensureDb();
    const existing = await this.findChatById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.role !== undefined) { updates.push('role = ?'); values.push(data.role); }
    if (data.content !== undefined) { updates.push('content = ?'); values.push(data.content); }
    if (data.audioUrl !== undefined) { updates.push('audio_url = ?'); values.push(data.audioUrl); }
    if (data.metadata !== undefined) { updates.push('metadata = ?'); values.push(JSON.stringify(data.metadata)); }

    values.push(id);

    await db.run(`UPDATE chats SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findChatById(id);
  }

  async deleteChat(id: string): Promise<boolean> {
    const db = this.ensureDb();
    const result = await db.run('DELETE FROM chats WHERE id = ?', [id]);
    return this.getChanges(result) > 0;
  }

  async deleteAllChats(sessionId?: string): Promise<number> {
    const db = this.ensureDb();
    if (sessionId) {
      const result = await db.run('DELETE FROM chats WHERE session_id = ?', [sessionId]);
      return this.getChanges(result);
    }
    const result = await db.run('DELETE FROM chats');
    return this.getChanges(result);
  }

  async getRecentChats(limit: number, sessionId?: string): Promise<ChatMessage[]> {
    const db = this.ensureDb();
    let query = 'SELECT * FROM chats';
    const params: unknown[] = [];

    if (sessionId) {
      query += ' WHERE session_id = ?';
      params.push(sessionId);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const result = await db.query(query, params);
    return (result.values || []).map(this.mapRowToChatMessage).reverse();
  }

  // ========== Settings (entity-specific names — see class comment) ==========

  async getSettings(): Promise<AppSettings> {
    const db = this.ensureDb();
    const result = await db.query('SELECT data FROM settings WHERE id = ?', ['default']);
    if (!result.values?.length) {
      return this.getDefaultSettings();
    }
    return JSON.parse(result.values[0].data as string);
  }

  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const db = this.ensureDb();
    const current = await this.getSettings();
    const updated = { ...current, ...settings, updatedAt: new Date() };

    await db.run(
      `INSERT OR REPLACE INTO settings (id, data, updated_at) VALUES (?, ?, ?)`,
      ['default', JSON.stringify(updated), Date.now()]
    );

    return updated;
  }

  async resetSettings(): Promise<AppSettings> {
    const db = this.ensureDb();
    const defaults = this.getDefaultSettings();
    await db.run(
      `INSERT OR REPLACE INTO settings (id, data, updated_at) VALUES (?, ?, ?)`,
      ['default', JSON.stringify(defaults), Date.now()]
    );
    return defaults;
  }

  // ========== Sync (entity-specific names — see class comment) ==========

  async getSyncStatus(): Promise<SyncStatus> {
    const db = this.ensureDb();
    const result = await db.query('SELECT * FROM settings WHERE id = ?', ['sync_status']);
    if (!result.values?.length) {
      return { lastSync: null, pendingChanges: 0, isSyncing: false, error: null };
    }
    return JSON.parse(result.values[0].data as string);
  }

  async updateSyncStatus(status: Partial<SyncStatus>): Promise<void> {
    const db = this.ensureDb();
    const current = await this.getSyncStatus();
    const updated = { ...current, ...status };
    await db.run(
      `INSERT OR REPLACE INTO settings (id, data, updated_at) VALUES (?, ?, ?)`,
      ['sync_status', JSON.stringify(updated), Date.now()]
    );
  }

  async queueChange(entity: string, entityId: string, operation: 'create' | 'update' | 'delete', data: unknown): Promise<void> {
    const db = this.ensureDb();
    const id = generateId();
    await db.run(
      `INSERT INTO sync_queue (id, entity, entity_id, operation, data, created_at, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, entity, entityId, operation, JSON.stringify(data), Date.now(), 0]
    );
  }

  async getPendingChanges(): Promise<Array<{ entity: string; entityId: string; operation: string; data: unknown }>> {
    const db = this.ensureDb();
    const result = await db.query('SELECT entity, entity_id, operation, data FROM sync_queue ORDER BY created_at ASC');
    return (result.values || []).map((row: Record<string, unknown>) => ({
      entity: row.entity as string,
      entityId: row.entity_id as string,
      operation: row.operation as string,
      data: JSON.parse(row.data as string),
    }));
  }

  async clearPendingChanges(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = this.ensureDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM sync_queue WHERE id IN (${placeholders})`, ids);
  }

  // ========== IStorageService ==========

  async getItem<T>(key: string): Promise<T | null> {
    const db = this.ensureDb();
    const result = await db.query('SELECT data FROM settings WHERE id = ?', [`storage_${key}`]);
    if (!result.values?.length) return null;
    return JSON.parse(result.values[0].data as string);
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    const db = this.ensureDb();
    await db.run(
      `INSERT OR REPLACE INTO settings (id, data, updated_at) VALUES (?, ?, ?)`,
      [`storage_${key}`, JSON.stringify(value), Date.now()]
    );
  }

  async removeItem(key: string): Promise<void> {
    const db = this.ensureDb();
    await db.run('DELETE FROM settings WHERE id = ?', [`storage_${key}`]);
  }

  async clear(): Promise<void> {
    const db = this.ensureDb();
    await db.run("DELETE FROM settings WHERE id LIKE 'storage_%'");
  }

  async getAllKeys(): Promise<string[]> {
    const db = this.ensureDb();
    const result = await db.query("SELECT id FROM settings WHERE id LIKE 'storage_%'");
    return (result.values || []).map((row: Record<string, unknown>) => (row.id as string).replace('storage_', ''));
  }
}

export const sqliteService = new SQLiteService();
