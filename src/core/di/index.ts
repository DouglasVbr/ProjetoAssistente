/**
 * Dependency Injection Container - Lightweight IoC container
 */

type Factory<T> = () => T | Promise<T>;
type Token<T> = string | symbol | (new (...args: unknown[]) => T);

interface Registration<T> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

export class Container {
  private registrations: Map<Token<unknown>, Registration<unknown>> = new Map();
  private resolving: Set<Token<unknown>> = new Set();

  register<T>(token: Token<T>, factory: Factory<T>, singleton = true): void {
    this.registrations.set(token, { factory, singleton });
  }

  registerInstance<T>(token: Token<T>, instance: T): void {
    this.registrations.set(token, {
      factory: () => instance,
      singleton: true,
      instance,
    });
  }

  async resolve<T>(token: Token<T>): Promise<T> {
    const registration = this.registrations.get(token);
    if (!registration) {
      throw new Error(`No registration found for token: ${String(token)}`);
    }

    if (this.resolving.has(token)) {
      throw new Error(`Circular dependency detected for token: ${String(token)}`);
    }

    if (registration.singleton && registration.instance !== undefined) {
      return registration.instance as T;
    }

    this.resolving.add(token);
    try {
      const instance = await registration.factory();
      
      if (registration.singleton) {
        registration.instance = instance;
      }
      
      return instance as T;
    } finally {
      this.resolving.delete(token);
    }
  }

  has(token: Token<unknown>): boolean {
    return this.registrations.has(token);
  }

  unregister(token: Token<unknown>): void {
    this.registrations.delete(token);
  }

  clear(): void {
    this.registrations.clear();
    this.resolving.clear();
  }

  createScope(): Container {
    const scope = new Container();
    for (const [token, reg] of this.registrations) {
      if (reg.singleton && reg.instance !== undefined) {
        scope.registerInstance(token, reg.instance);
      } else {
        scope.registrations.set(token, { ...reg });
      }
    }
    return scope;
  }
}

export const container = new Container();

export function inject<T>(_token: Token<T>) {
  return function (_target: object, _propertyKey: string | symbol, _parameterIndex: number) {
    // Decorator implementation would go here with reflect-metadata
  };
}

export function injectable() {
  return function (_constructor: Function) {
    // Mark as injectable
  };
}

export const TOKENS = {
  MemoryRepository: Symbol('MemoryRepository'),
  ChatRepository: Symbol('ChatRepository'),
  SettingsRepository: Symbol('SettingsRepository'),
  SyncRepository: Symbol('SyncRepository'),
  NetworkRepository: Symbol('NetworkRepository'),
  AIService: Symbol('AIService'),
  VoiceService: Symbol('VoiceService'),
  StorageService: Symbol('StorageService'),
  FileService: Symbol('FileService'),
  MemoryUseCases: Symbol('MemoryUseCases'),
  ChatUseCases: Symbol('ChatUseCases'),
  SettingsUseCases: Symbol('SettingsUseCases'),
  SyncUseCases: Symbol('SyncUseCases'),
  EventBus: Symbol('EventBus'),
  Config: Symbol('Config'),
} as const;