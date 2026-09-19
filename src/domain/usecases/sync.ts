/**
 * Sync Use Cases - Business logic for offline-first synchronization
 */

import type { SyncStatus, NetworkStatus } from '../entities';
import type { ISyncRepository, INetworkRepository, IMemoryRepository, IChatRepository, ISettingsRepository } from '../repositories';

export class SyncUseCases {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private networkUnsubscribe: (() => void) | null = null;

  constructor(
    private syncRepo: ISyncRepository,
    private networkRepo: INetworkRepository,
    private memoryRepo: IMemoryRepository,
    private chatRepo: IChatRepository,
    private settingsRepo: ISettingsRepository
  ) {}

  async initialize(): Promise<void> {
    // Listen for network changes
    this.networkUnsubscribe = this.networkRepo.onStatusChange(async (status) => {
      if (status.online && !status.effectiveType?.includes('2g')) {
        await this.syncIfEnabled();
      }
    });

    // Start periodic sync
    await this.startPeriodicSync();
  }

  async destroy(): Promise<void> {
    this.stopPeriodicSync();
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = null;
    }
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return this.syncRepo.getStatus();
  }

  async syncIfEnabled(): Promise<void> {
    const settings = await this.settingsRepo.get();
    if (!settings.syncEnabled) return;

    const status = await this.syncRepo.getStatus();
    if (status.isSyncing) return;

    await this.performSync();
  }

  async performSync(): Promise<void> {
    await this.syncRepo.updateStatus({ isSyncing: true, error: null });

    try {
      // Sync memories
      const unsyncedMemories = await this.memoryRepo.getUnsynced();
      for (const memory of unsyncedMemories) {
        await this.pushMemory(memory);
      }
      await this.memoryRepo.markSynced(unsyncedMemories.map(m => m.id));

      // Sync chat history (if needed)
      // await this.syncChatHistory();

      await this.syncRepo.updateStatus({
        lastSync: new Date(),
        pendingChanges: 0,
        isSyncing: false,
        error: null,
      });
    } catch (error) {
      await this.syncRepo.updateStatus({
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      });
      throw error;
    }
  }

  private async pushMemory(memory: any): Promise<void> {
    // In a real implementation, this would push to a backend API
    // For now, just simulate the push
    console.log('Pushing memory to cloud:', memory.id);
    await new Promise(r => setTimeout(r, 100));
  }

  private async syncChatHistory(): Promise<void> {
    // Implementation for chat history sync
  }

  async startPeriodicSync(): Promise<void> {
    this.stopPeriodicSync();
    
    const settings = await this.settingsRepo.get();
    const intervalMs = settings.syncInterval * 60 * 1000;

    this.syncInterval = setInterval(async () => {
      const networkStatus = await this.networkRepo.getStatus();
      if (networkStatus.online) {
        await this.syncIfEnabled();
      }
    }, intervalMs);
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async forceSync(): Promise<void> {
    await this.performSync();
  }

  async getPendingChangesCount(): Promise<number> {
    const changes = await this.syncRepo.getPendingChanges();
    return changes.length;
  }
}