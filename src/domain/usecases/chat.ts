/**
 * Chat Use Cases - Business logic for conversation management
 */

import type { ChatMessage, AIModelConfig, AIResponse } from '../entities';
import type { IChatRepository, IAIService, IMemoryRepository } from '../repositories';
import { v4 as uuidv4 } from 'uuid';

export class ChatUseCases {
  constructor(
    private chatRepo: IChatRepository,
    private aiService: IAIService,
    private memoryRepo: IMemoryRepository
  ) {}

  async getMessages(sessionId?: string): Promise<ChatMessage[]> {
    return this.chatRepo.findAll(sessionId);
  }

  async getRecentMessages(limit: number, sessionId?: string): Promise<ChatMessage[]> {
    return this.chatRepo.getRecent(limit, sessionId);
  }

  async sendMessage(content: string, sessionId?: string): Promise<ChatMessage> {
    const userMessage = await this.chatRepo.create({
      role: 'user',
      content,
      metadata: { sessionId },
    });

    return userMessage;
  }

  async getAIResponse(messages: ChatMessage[], config: AIModelConfig): Promise<AIResponse> {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      const memoryMatch = await this.findMemoryMatch(lastUserMessage.content);
      if (memoryMatch) {
        return {
          text: memoryMatch.answerText,
          model: 'memory',
          provider: 'memory',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
    }

    return this.aiService.chat(messages, config);
  }

  async streamAIResponse(
    messages: ChatMessage[],
    config: AIModelConfig,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse> {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      const memoryMatch = await this.findMemoryMatch(lastUserMessage.content);
      if (memoryMatch) {
        const text = memoryMatch.answerText;
        const words = text.split(' ');
        for (const word of words) {
          onChunk(word + ' ');
          await new Promise(r => setTimeout(r, 30));
        }
        return {
          text,
          model: 'memory',
          provider: 'memory',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
    }

    return this.aiService.streamChat(messages, config, onChunk);
  }

  async saveAssistantResponse(content: string, sessionId?: string, metadata?: Record<string, unknown>): Promise<ChatMessage> {
    return this.chatRepo.create({
      role: 'assistant',
      content,
      metadata: { sessionId, ...metadata },
    });
  }

  async clearHistory(sessionId?: string): Promise<number> {
    return this.chatRepo.deleteAll(sessionId);
  }

  private async findMemoryMatch(query: string): Promise<{ answerText: string } | null> {
    return null;
  }

  async processVoiceCommand(command: { text: string; confidence: number }, config: AIModelConfig): Promise<AIResponse> {
    const userMessage = await this.sendMessage(command.text);
    
    const messages = await this.getRecentMessages(20);
    const allMessages = [...messages, userMessage];
    
    return this.getAIResponse(allMessages, config);
  }
}