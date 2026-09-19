/**
 * Memory Use Cases - Business logic for memory management
 */

import type { Memory, VoiceCommand } from '../entities';
import type { IMemoryRepository, IAIService, ISyncRepository } from '../repositories';
import { v4 as uuidv4 } from 'uuid';

export class MemoryUseCases {
  constructor(
    private memoryRepo: IMemoryRepository,
    private aiService: IAIService,
    private syncRepo: ISyncRepository
  ) {}

  async getAllMemories(): Promise<Memory[]> {
    return this.memoryRepo.findAll();
  }

  async getMemory(id: string): Promise<Memory | null> {
    return this.memoryRepo.findById(id);
  }

  async createMemory(
    questionText: string,
    questionVoice: string,
    answerText: string,
    answerVoice: string
  ): Promise<Memory> {
    const embeddings = await this.generateEmbedding(questionText);
    
    const memory: Omit<Memory, 'id' | 'createdAt' | 'updatedAt' | 'synced'> = {
      questionText,
      questionVoice,
      answerText,
      answerVoice,
      embeddings,
      metadata: { source: 'user' },
    };

    const created = await this.memoryRepo.create(memory);
    
    await this.syncRepo.queueChange('memories', created.id, 'create', created);
    
    return created;
  }

  async updateMemory(
    id: string,
    data: Partial<Pick<Memory, 'questionText' | 'questionVoice' | 'answerText' | 'answerVoice'>>
  ): Promise<Memory | null> {
    const existing = await this.memoryRepo.findById(id);
    if (!existing) return null;

    let embeddings = existing.embeddings;
    if (data.questionText && data.questionText !== existing.questionText) {
      embeddings = await this.generateEmbedding(data.questionText);
    }

    const updated = await this.memoryRepo.update(id, { ...data, embeddings, updatedAt: new Date() });
    
    if (updated) {
      await this.syncRepo.queueChange('memories', id, 'update', updated);
    }
    
    return updated;
  }

  async deleteMemory(id: string): Promise<boolean> {
    const deleted = await this.memoryRepo.delete(id);
    if (deleted) {
      await this.syncRepo.queueChange('memories', id, 'delete', { id });
    }
    return deleted;
  }

  async deleteAllMemories(): Promise<number> {
    const count = await this.memoryRepo.deleteAll();
    await this.syncRepo.queueChange('memories', 'all', 'delete', { all: true });
    return count;
  }

  async searchMemories(query: string, limit = 10): Promise<Memory[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    const semanticResults = await this.memoryRepo.searchByEmbedding(queryEmbedding, limit, 0.7);
    
    if (semanticResults.length > 0) {
      return semanticResults;
    }

    return this.memoryRepo.findByQuestionText(query);
  }

  async findBestMatch(command: VoiceCommand): Promise<Memory | null> {
    if (!command.text) return null;
    
    const results = await this.searchMemories(command.text, 1);
    return results[0] || null;
  }

  async processVoiceCommand(command: VoiceCommand): Promise<{ memory: Memory | null; response: string }> {
    const memory = await this.findBestMatch(command);
    
    if (memory) {
      return { memory, response: memory.answerText };
    }

    const aiResponse = await this.generateAIResponse(command.text);
    return { memory: null, response: aiResponse };
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const settings = await this.getAIConfig();
      return await this.aiService.getEmbedding(text, settings);
    } catch {
      return new Array(384).fill(0);
    }
  }

  private async generateAIResponse(prompt: string): Promise<string> {
    try {
      const settings = await this.getAIConfig();
      const response = await this.aiService.chat(
        [
          { id: '1', role: 'system', content: 'Você é Phennellopy, uma assistente pessoal útil e amigável. Responda em português.', timestamp: new Date() },
          { id: '2', role: 'user', content: prompt, timestamp: new Date() }
        ],
        settings
      );
      return response.text;
    } catch {
      return 'Desculpe, não consegui processar sua solicitação no momento.';
    }
  }

  private async getAIConfig() {
    return {
      provider: 'openai' as const,
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1000,
      topP: 1,
      presencePenalty: 0,
      frequencyPenalty: 0,
    };
  }

  async getMemoriesCount(): Promise<number> {
    return this.memoryRepo.count();
  }

  async getUnsyncedMemories(): Promise<Memory[]> {
    return this.memoryRepo.getUnsynced();
  }

  async syncMemories(): Promise<void> {
    const unsynced = await this.memoryRepo.getUnsynced();
    await this.memoryRepo.markSynced(unsynced.map(m => m.id));
  }
}