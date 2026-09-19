/**
 * Sync Service - Supabase REST (PostgREST) backend
 *
 * Talks to Supabase over its auto-generated REST API with plain `fetch`
 * (same style as the OpenAI/Ollama/Gemini AI services in this codebase),
 * so no `@supabase/supabase-js` dependency is required.
 *
 * Expects a `memories` table shaped like `supabase/schema.sql` (see that
 * file for the exact `create table` + RLS policy to run once in the
 * Supabase SQL editor before sync will work).
 */

import type { Memory } from '@domain/entities';
import { env } from '@core/config';

interface SupabaseMemoryRow {
  id: string;
  question_text: string;
  question_voice: string;
  answer_text: string;
  answer_voice: string;
  embeddings: number[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toRow(memory: Memory): SupabaseMemoryRow {
  return {
    id: memory.id,
    question_text: memory.questionText,
    question_voice: memory.questionVoice,
    answer_text: memory.answerText,
    answer_voice: memory.answerVoice,
    embeddings: memory.embeddings ?? null,
    metadata: memory.metadata ?? null,
    created_at: memory.createdAt.toISOString(),
    updated_at: memory.updatedAt.toISOString(),
  };
}

export class SupabaseSyncService {
  private baseUrl: string;
  private anonKey: string;

  constructor() {
    this.baseUrl = env.VITE_SUPABASE_URL;
    this.anonKey = env.VITE_SUPABASE_ANON_KEY;
  }

  /**
   * The app should work fully offline-first without Supabase configured —
   * this lets callers skip sync gracefully instead of throwing on every
   * attempt when the user hasn't set up a backend.
   */
  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.anonKey);
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      apikey: this.anonKey,
      Authorization: `Bearer ${this.anonKey}`,
      // merge-duplicates = upsert on conflict; return=minimal = skip echoing the row back
      Prefer: 'resolution=merge-duplicates,return=minimal',
    };
  }

  /** Upserts a batch of memories in one request (PostgREST bulk upsert). */
  async pushMemories(memories: Memory[]): Promise<void> {
    if (memories.length === 0) return;
    if (!this.isConfigured()) {
      throw new Error('Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes)');
    }

    const response = await fetch(`${this.baseUrl}/rest/v1/memories?on_conflict=id`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(memories.map(toRow)),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => '');
      throw new Error(`Supabase sync falhou (${response.status}): ${error}`);
    }
  }

  async pushMemory(memory: Memory): Promise<void> {
    return this.pushMemories([memory]);
  }
}

export const supabaseSyncService = new SupabaseSyncService();
