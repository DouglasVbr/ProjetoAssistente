/**
 * Domain Events - Event-driven communication between layers
 */

export type DomainEventType =
  | 'memory.created'
  | 'memory.updated'
  | 'memory.deleted'
  | 'memory.all_deleted'
  | 'chat.message_sent'
  | 'chat.response_received'
  | 'chat.history_cleared'
  | 'settings.updated'
  | 'voice.listening_started'
  | 'voice.listening_stopped'
  | 'voice.command_recognized'
  | 'voice.speech_started'
  | 'voice.speech_stopped'
  | 'network.online'
  | 'network.offline'
  | 'sync.started'
  | 'sync.completed'
  | 'sync.failed'
  | 'ai.provider_changed'
  | 'ai.model_changed'
  | 'error.occurred';

export interface DomainEvent<T = unknown> {
  type: DomainEventType;
  payload: T;
  timestamp: Date;
  correlationId?: string;
}

export interface MemoryCreatedPayload {
  memoryId: string;
  questionText: string;
}

export interface MemoryUpdatedPayload {
  memoryId: string;
  changes: Record<string, unknown>;
}

export interface MemoryDeletedPayload {
  memoryId: string;
}

export interface ChatMessageSentPayload {
  messageId: string;
  content: string;
  sessionId?: string;
}

export interface ChatResponseReceivedPayload {
  messageId: string;
  content: string;
  provider: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface VoiceCommandRecognizedPayload {
  text: string;
  confidence: number;
  intent: string;
  isWakeWord: boolean;
}

export interface SettingsUpdatedPayload {
  keys: string[];
}

export interface SyncStartedPayload {
  trigger: 'manual' | 'periodic' | 'network_change';
}

export interface SyncCompletedPayload {
  duration: number;
  changesSynced: number;
}

export interface SyncFailedPayload {
  error: string;
}

export interface ErrorOccurredPayload {
  message: string;
  code?: string;
  context?: Record<string, unknown>;
}

type EventHandler<T = unknown> = (event: DomainEvent<T>) => void | Promise<void>;

export class EventBus {
  private handlers: Map<DomainEventType, Set<EventHandler>> = new Map();
  private middleware: Array<(event: DomainEvent) => DomainEvent | Promise<DomainEvent>> = [];

  subscribe<T>(type: DomainEventType, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler);
    
    return () => this.unsubscribe(type, handler);
  }

  unsubscribe<T>(type: DomainEventType, handler: EventHandler<T>): void {
    this.handlers.get(type)?.delete(handler as EventHandler);
  }

  use(middleware: (event: DomainEvent) => DomainEvent | Promise<DomainEvent>): void {
    this.middleware.push(middleware);
  }

  async emit<T>(event: DomainEvent<T>): Promise<void> {
    let processedEvent: DomainEvent = event;
    for (const mw of this.middleware) {
      processedEvent = await mw(processedEvent);
    }

    const handlers = this.handlers.get(processedEvent.type);
    if (handlers) {
      await Promise.all(
        Array.from(handlers).map(handler => 
          Promise.resolve(handler(processedEvent)).catch(err => {
            console.error(`Error in event handler for ${processedEvent.type}:`, err);
          })
        )
      );
    }
  }

  async emitSync<T>(type: DomainEventType, payload: T, correlationId?: string): Promise<void> {
    await this.emit({
      type,
      payload,
      timestamp: new Date(),
      correlationId,
    });
  }
}

export const eventBus = new EventBus();

export const Events = {
  memory: {
    created: (payload: MemoryCreatedPayload, correlationId?: string) =>
      eventBus.emitSync('memory.created', payload, correlationId),
    updated: (payload: MemoryUpdatedPayload, correlationId?: string) =>
      eventBus.emitSync('memory.updated', payload, correlationId),
    deleted: (payload: MemoryDeletedPayload, correlationId?: string) =>
      eventBus.emitSync('memory.deleted', payload, correlationId),
    allDeleted: (correlationId?: string) =>
      eventBus.emitSync('memory.all_deleted', {}, correlationId),
  },
  chat: {
    messageSent: (payload: ChatMessageSentPayload, correlationId?: string) =>
      eventBus.emitSync('chat.message_sent', payload, correlationId),
    responseReceived: (payload: ChatResponseReceivedPayload, correlationId?: string) =>
      eventBus.emitSync('chat.response_received', payload, correlationId),
    historyCleared: (sessionId?: string, correlationId?: string) =>
      eventBus.emitSync('chat.history_cleared', { sessionId }, correlationId),
  },
  settings: {
    updated: (payload: SettingsUpdatedPayload, correlationId?: string) =>
      eventBus.emitSync('settings.updated', payload, correlationId),
  },
  voice: {
    listeningStarted: (correlationId?: string) =>
      eventBus.emitSync('voice.listening_started', {}, correlationId),
    listeningStopped: (correlationId?: string) =>
      eventBus.emitSync('voice.listening_stopped', {}, correlationId),
    commandRecognized: (payload: VoiceCommandRecognizedPayload, correlationId?: string) =>
      eventBus.emitSync('voice.command_recognized', payload, correlationId),
    speechStarted: (correlationId?: string) =>
      eventBus.emitSync('voice.speech_started', {}, correlationId),
    speechStopped: (correlationId?: string) =>
      eventBus.emitSync('voice.speech_stopped', {}, correlationId),
  },
  network: {
    online: (correlationId?: string) =>
      eventBus.emitSync('network.online', {}, correlationId),
    offline: (correlationId?: string) =>
      eventBus.emitSync('network.offline', {}, correlationId),
  },
  sync: {
    started: (payload: SyncStartedPayload, correlationId?: string) =>
      eventBus.emitSync('sync.started', payload, correlationId),
    completed: (payload: SyncCompletedPayload, correlationId?: string) =>
      eventBus.emitSync('sync.completed', payload, correlationId),
    failed: (payload: SyncFailedPayload, correlationId?: string) =>
      eventBus.emitSync('sync.failed', payload, correlationId),
  },
  ai: {
    providerChanged: (provider: string, correlationId?: string) =>
      eventBus.emitSync('ai.provider_changed', { provider }, correlationId),
    modelChanged: (model: string, correlationId?: string) =>
      eventBus.emitSync('ai.model_changed', { model }, correlationId),
  },
  error: {
    occurred: (payload: ErrorOccurredPayload, correlationId?: string) =>
      eventBus.emitSync('error.occurred', payload, correlationId),
  },
};