/**
 * IndexedDB Service - Web fallback for storage
 */

import type { Memory, ChatMessage, AppSettings, SyncStatus } from '@domain/entities';
import { DatabaseError } from '@core/errors';
import { generateId } from '@core/utils';

const DB_NAME = 'phennellopy-db';
const DB_VERSION = 1;
const STORES = {
  memories: 'memories',
  chats: 'chats',
  settings: 'settings',
  syncQueue: 'sync_queue',
} as const;

export class IndexedDBService {
  private db: IDBDatabase | null = null;
  private initialized = false;

  // ========== Core DB Methods ==========

  private ensureDb(): IDBDatabase {
    if (!this.db || !this.initialized) {
      throw new Error('IndexedDB not initialized');
    }
    return this.db;
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    const db = this.ensureDb();
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Request failed: ' + request.error));
    });
  }

  private mapToMemory(obj: Record<string, unknown>): any {
    return {
      id: obj.id as string,
      questionText: obj.questionText as string,
      questionVoice: obj.questionVoice as string,
      answerText: obj.answerText as string,
      answerVoice: obj.answerVoice as string,
      embeddings: obj.embeddings as number[] | undefined,
      metadata: obj.metadata as Record<string, unknown> | undefined,
      createdAt: new Date(obj.createdAt as string | number),
      updatedAt: new Date(obj.updatedAt as string | number),
      synced: obj.synced as boolean,
    };
  }

  private mapToChatMessage(obj: Record<string, unknown>): any {
    return {
      id: obj.id as string,
      role: obj.role as 'user' | 'assistant' | 'system',
      content: obj.content as string,
      timestamp: new Date(obj.timestamp as string | number),
      audioUrl: obj.audioUrl as string | undefined,
      metadata: obj.metadata as Record<string, unknown> | undefined,
    };
  }

  private getDefaultSettings(): any {
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

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ========== Memory Methods ==========

  async findAllMemories(): Promise<any[]> {
    const store = this.getStore('memories');
    const request = store.getAll();
    const results = await this.request(request);
    return (results || []).map(this.mapToMemory).sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findMemoryById(id: string): Promise<any | null> {
    const store = this.getStore('memories');
    const request = store.get(id);
    const result = await this.request(request);
    return result ? this.mapToMemory(result) : null;
  }

  async findMemoriesByQuestionText(text: string): Promise<any[]> {
    const store = this.getStore('memories');
    const index = store.index('question_text');
    const request = index.getAll(text);
    return this.request(request).then((results: any) =>
      (results || []).map(this.mapToMemory)
    );
  }

  async searchMemoriesByEmbedding(embedding: number[], limit = 10, threshold = 0.7): Promise<any[]> {
    const all = await this.findAllMemories();
    return all
      .filter((m: any) => m.embeddings && m.embeddings.length === embedding.length)
      .map((m: any) => ({ memory: m, similarity: this.cosineSimilarity(embedding, m.embeddings!) }))
      .filter((r: any) => r.similarity >= threshold)
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((r: any) => r.memory);
  }

  async createMemory(data: any): Promise<any> {
    const store = this.getStore('memories', 'readwrite');
    const now = new Date();
    const memory: any = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      synced: false,
    };

    await this.request(store.add(memory));
    return memory;
  }

  async updateMemory(id: string, data: any): Promise<any | null> {
    const store = this.getStore('memories', 'readwrite');
    const existing = await this.findMemoryById(id);
    if (!existing) return null;

    const updated = { ...existing, ...data, updatedAt: new Date(), synced: false };
    await this.request(store.put(updated));
    return updated;
  }

  async deleteMemory(id: string): Promise<boolean> {
    const store = this.getStore('memories', 'readwrite');
    await this.request(store.delete(id));
    return true;
  }

  async deleteAllMemories(): Promise<number> {
    const store = this.getStore('memories', 'readwrite');
    await this.request(store.clear());
    return 0;
  }

  async countMemories(): Promise<number> {
    const store = this.getStore('memories');
    const request = store.count();
    return this.request(request);
  }

  async getUnsyncedMemories(): Promise<any[]> {
    // IndexedDB keys can't be booleans, so `synced` can't be queried through
    // an index (`index.getAll(false)` throws at runtime). Filter in memory instead.
    const all = await this.findAllMemories();
    return all.filter((m: any) => !m.synced);
  }

  async markMemoriesSynced(ids: string[]): Promise<void> {
    const store = this.getStore('memories', 'readwrite');
    for (const id of ids) {
      const memory = await this.findMemoryById(id);
      if (memory) {
        memory.synced = true;
        memory.updatedAt = new Date();
        await this.request(store.put(memory));
      }
    }
  }

  // ========== Chat Methods ==========

  async findAllChats(sessionId?: string): Promise<any[]> {
    const store = this.getStore('chats');
    if (sessionId) {
      const index = store.index('session_id');
      const request = index.getAll(sessionId);
      const results = await this.request(request);
      return (results || []).map(this.mapToChatMessage).sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    const request = store.getAll();
    const results = await this.request(request);
    return (results || []).map(this.mapToChatMessage).sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async findChatById(id: string): Promise<any | null> {
    const store = this.getStore('chats');
    const request = store.get(id);
    const result = await this.request(request);
    return result ? this.mapToChatMessage(result) : null;
  }

  async createChat(data: any): Promise<any> {
    const store = this.getStore('chats', 'readwrite');
    const message: any = {
      ...data,
      id: generateId(),
      timestamp: new Date(),
    };
    await this.request(store.add(message));
    return message;
  }

  async updateChat(id: string, data: any): Promise<any | null> {
    const store = this.getStore('chats', 'readwrite');
    const existing = await this.findChatById(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    await this.request(store.put(updated));
    return updated;
  }

  async deleteChat(id: string): Promise<boolean> {
    const store = this.getStore('chats', 'readwrite');
    await this.request(store.delete(id));
    return true;
  }

  async deleteAllChats(sessionId?: string): Promise<number> {
    const store = this.getStore('chats', 'readwrite');
    if (sessionId) {
      const index = store.index('session_id');
      const request = index.getAllKeys(sessionId);
      const keys = await this.request(request);
      for (const key of keys || []) {
        await this.request(store.delete(key));
      }
      return keys?.length || 0;
    }
    await this.request(store.clear());
    return 0;
  }

  async getRecentChats(limit: number, sessionId?: string): Promise<any[]> {
    const messages = await this.findAllChats(sessionId);
    return messages.slice(-limit);
  }

  // ========== Settings Methods ==========

  async getSettings(): Promise<any> {
    const store = this.getStore('settings');
    const request = store.get('default');
    const result = await this.request(request);
    return result?.data || this.getDefaultSettings();
  }

  async updateSettings(settings: any): Promise<any> {
    const store = this.getStore('settings', 'readwrite');
    const current = await this.getSettings();
    const updated = { ...current, ...settings, updatedAt: new Date() };
    await this.request(store.put({ id: 'default', data: updated }));
    return updated;
  }

  async resetSettings(): Promise<any> {
    const store = this.getStore('settings', 'readwrite');
    const defaults = this.getDefaultSettings();
    await this.request(store.put({ id: 'default', data: defaults }));
    return defaults;
  }

  // ========== Sync Methods ==========

  async getSyncStatus(): Promise<any> {
    const store = this.getStore('settings');
    const request = store.get('sync_status');
    const result = await this.request(request);
    return result?.data || { lastSync: null, pendingChanges: 0, isSyncing: false, error: null };
  }

  async updateSyncStatus(status: any): Promise<void> {
    const store = this.getStore('settings', 'readwrite');
    const current = await this.getSyncStatus();
    const updated = { ...current, ...status };
    await this.request(store.put({ id: 'sync_status', data: updated }));
  }

  async queueSyncChange(entity: string, entityId: string, operation: string, data: any): Promise<void> {
    const store = this.getStore('sync_queue', 'readwrite');
    const entry = {
      id: generateId(),
      entity,
      entityId,
      operation,
      data,
      createdAt: new Date(),
      attempts: 0,
    };
    await this.request(store.add(entry));
  }

  async getPendingSyncChanges(): Promise<any[]> {
    const store = this.getStore('sync_queue');
    const request = store.getAll();
    const results = await this.request(request);
    return (results || []).map((r: any) => ({
      entity: r.entity,
      entityId: r.entityId,
      operation: r.operation,
      data: r.data,
    }));
  }

  async clearPendingSyncChanges(ids: string[]): Promise<void> {
    const store = this.getStore('sync_queue', 'readwrite');
    for (const id of ids) {
      await this.request(store.delete(id));
    }
  }

  // ========== Storage Methods ==========

  async getStorageItem<T>(key: string): Promise<T | null> {
    const store = this.getStore('settings');
    const request = store.get(`storage_${key}`);
    const result = await this.request(request);
    return result?.data || null;
  }

  async setStorageItem<T>(key: string, value: T): Promise<void> {
    const store = this.getStore('settings', 'readwrite');
    await this.request(store.put({ id: `storage_${key}`, data: value }));
  }

  async removeStorageItem(key: string): Promise<void> {
    const store = this.getStore('settings', 'readwrite');
    await this.request(store.delete(`storage_${key}`));
  }

  async clearStorage(): Promise<void> {
    const store = this.getStore('settings', 'readwrite');
    const request = store.getAllKeys();
    const keys = await this.request(request);
    const storageKeys = (keys || []).filter((k: any) => typeof k === 'string' && k.startsWith('storage_'));
    for (const key of storageKeys) {
      await this.request(store.delete(key));
    }
  }

  async getAllStorageKeys(): Promise<string[]> {
    const store = this.getStore('settings');
    const request = store.getAllKeys();
    const keys = await this.request(request);
    return (keys || [])
      .filter((k: any) => typeof k === 'string' && k.startsWith('storage_'))
      .map((k: any) => (k as string).replace('storage_', ''));
  }

  // ========== Public API (hooks compatibility) ==========
  // Generic names matching the domain repository interfaces. Only the Memory
  // (+ Storage) ones are actually consumed today (see presentation/hooks/index.ts
  // useMemories()); the Chat/Settings/Sync aliases are kept for when those
  // repositories get wired into the DI container.

  async findAll(): Promise<any[]> { return this.findAllMemories(); }
  async findById(id: string): Promise<any | null> { return this.findMemoryById(id); }
  async findByQuestionText(text: string): Promise<any[]> { return this.findMemoriesByQuestionText(text); }
  async searchByEmbedding(embedding: number[], limit = 10, threshold = 0.7): Promise<any[]> { return this.searchMemoriesByEmbedding(embedding, limit, threshold); }
  async create(data: any): Promise<any> { return this.createMemory(data); }
  async update(id: string, data: any): Promise<any | null> { return this.updateMemory(id, data); }
  async delete(id: string): Promise<boolean> { return this.deleteMemory(id); }
  async deleteAll(): Promise<number> { return this.deleteAllMemories(); }
  async count(): Promise<number> { return this.countMemories(); }
  async getUnsynced(): Promise<any[]> { return this.getUnsyncedMemories(); }
  async markSynced(ids: string[]): Promise<void> { return this.markMemoriesSynced(ids); }

  async findAllChatsAlias(sessionId?: string): Promise<any[]> { return this.findAllChats(sessionId); }
  async findChatByIdAlias(id: string): Promise<any | null> { return this.findChatById(id); }
  async createChatAlias(data: any): Promise<any> { return this.createChat(data); }
  async updateChatAlias(id: string, data: any): Promise<any | null> { return this.updateChat(id, data); }
  async deleteChatAlias(id: string): Promise<boolean> { return this.deleteChat(id); }
  async deleteAllChatsAlias(sessionId?: string): Promise<number> { return this.deleteAllChats(sessionId); }
  async getRecentChatsAlias(limit: number, sessionId?: string): Promise<any[]> { return this.getRecentChats(limit, sessionId); }

  async getSettingsAlias(): Promise<any> { return this.getSettings(); }
  async updateSettingsAlias(settings: any): Promise<any> { return this.updateSettings(settings); }
  async resetSettingsAlias(): Promise<any> { return this.resetSettings(); }

  async getSyncStatusAlias(): Promise<any> { return this.getSyncStatus(); }
  async updateSyncStatusAlias(status: any): Promise<void> { return this.updateSyncStatus(status); }
  async queueChange(entity: string, entityId: string, operation: string, data: any): Promise<void> { return this.queueSyncChange(entity, entityId, operation, data); }
  async getPendingChanges(): Promise<any[]> { return this.getPendingSyncChanges(); }
  async clearPendingChanges(ids: string[]): Promise<void> { return this.clearPendingSyncChanges(ids); }

  async getItem<T>(key: string): Promise<T | null> { return this.getStorageItem(key); }
  async setItem<T>(key: string, value: T): Promise<void> { return this.setStorageItem(key, value); }
  async removeItem(key: string): Promise<void> { return this.removeStorageItem(key); }
  async clear(): Promise<void> { return this.clearStorage(); }
  async getAllKeys(): Promise<string[]> { return this.getAllStorageKeys(); }

  // ========== Core (init/teardown) ==========

  async initialize(): Promise<void> {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open('phennellopy-db', 1);

      request.onerror = () => reject(new Error('Failed to open IndexedDB: ' + request.error));
      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('memories')) {
          const store = db.createObjectStore('memories', { keyPath: 'id' });
          store.createIndex('question_text', 'questionText', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
          store.createIndex('created_at', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('chats')) {
          const store = db.createObjectStore('chats', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('session_id', 'sessionId', { unique: false });
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('sync_queue')) {
          const store = db.createObjectStore('sync_queue', { keyPath: 'id' });
          store.createIndex('entity_entityId', ['entity', 'entityId'], { unique: false });
          store.createIndex('created_at', 'createdAt', { unique: false });
        }
      };
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

export const indexedDBService = new IndexedDBService();
