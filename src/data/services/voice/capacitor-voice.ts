/**
 * Voice Service - Web Speech API implementation (works in PWA and browsers)
 */

import type { IVoiceService, VoiceRecognitionOptions, VoiceSynthesisOptions, VoiceInfo, VoiceCommand } from '@domain/repositories';
import { VoiceRecognitionError, VoiceSynthesisError } from '@core/errors';
import { Events } from '@domain/events';

interface SpeechRecognitionResult {
  matches: string[];
  isFinal: boolean;
}

// Web Speech API implementation for PWA/browser
export class WebVoiceService implements IVoiceService {
  private recognition: any = null;
  private synthesis: SpeechSynthesis | null = null;
  private listening = false;
  private speaking = false;
  private resultCallback: ((command: VoiceCommand) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private wakeWord = 'phennellopy';

  constructor() {
    if (typeof window !== 'undefined') {
      this.synthesis = window.speechSynthesis;
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.setupRecognition();
      }
    }
  }

  private setupRecognition(): void {
    if (!this.recognition) return;
    
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'pt-BR';
    this.recognition.maxAlternatives = 5;

    this.recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;
      const confidence = result[0].confidence;

      if (this.resultCallback) {
        const isWakeWord = this.checkWakeWord(transcript);
        this.resultCallback({
          text: transcript,
          confidence: isFinal ? confidence : confidence * 0.5,
          isWakeWord,
          intent: isWakeWord ? 'unknown' : this.classifyIntent(transcript),
        });
      }
    };

    this.recognition.onerror = (event: any) => {
      const err = new VoiceRecognitionError(event.error);
      this.errorCallback?.(err);
    };

    this.recognition.onend = () => {
      this.listening = false;
    };
  }

  async initialize(): Promise<void> {
    // Web Speech API doesn't need explicit initialization
  }

  async startListening(options: VoiceRecognitionOptions): Promise<void> {
    if (this.listening || !this.recognition) return;
    
    this.recognition.lang = options.language;
    this.recognition.continuous = options.continuous;
    this.recognition.interimResults = options.interimResults;
    
    try {
      this.recognition.start();
      this.listening = true;
    } catch (error) {
      throw new VoiceRecognitionError('Failed to start listening', error as Error);
    }
  }

  async stopListening(): Promise<void> {
    if (!this.listening || !this.recognition) return;
    
    this.recognition.stop();
    this.listening = false;
  }

  onResult(callback: (command: VoiceCommand) => void): () => void {
    this.resultCallback = callback;
    return () => { this.resultCallback = null; };
  }

  onError(callback: (error: Error) => void): () => void {
    this.errorCallback = callback;
    return () => { this.errorCallback = null; };
  }

  async speak(text: string, options?: VoiceSynthesisOptions): Promise<void> {
    if (!this.synthesis) throw new VoiceSynthesisError('Speech synthesis not available');
    
    if (this.speaking) {
      this.synthesis.cancel();
    }

    this.speaking = true;

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options?.language || 'pt-BR';
      utterance.rate = options?.rate || 0.75;
      utterance.pitch = options?.pitch || 1.0;
      utterance.volume = options?.volume || 1.0;
      
      if (options?.voiceId) {
        const voices = this.synthesis!.getVoices();
        const voice = voices.find(v => v.name === options.voiceId);
        if (voice) utterance.voice = voice;
      }

      utterance.onend = () => {
        this.speaking = false;
        resolve();
      };
      utterance.onerror = (event) => {
        this.speaking = false;
        reject(new VoiceSynthesisError('Speech synthesis error', new Error(event.error)));
      };

      this.synthesis!.speak(utterance);
    });
  }

  async stopSpeaking(): Promise<void> {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.speaking = false;
    }
  }

  async getVoices(): Promise<VoiceInfo[]> {
    if (!this.synthesis) return [];
    
    return this.synthesis.getVoices().map(v => ({
      id: v.name,
      name: v.name,
      language: v.lang,
      localService: v.localService,
      default: v.default,
    }));
  }

  isListening(): boolean {
    return this.listening;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  setWakeWord(word: string): void {
    this.wakeWord = word.toLowerCase().trim();
  }

  setWakeWordThreshold(_threshold: number): void {
    // Not used in web version
  }

  private checkWakeWord(text: string): boolean {
    const normalized = text.toLowerCase().trim();
    return normalized.includes(this.wakeWord);
  }

  private classifyIntent(text: string): VoiceCommand['intent'] {
    const normalized = text.toLowerCase().trim();
    
    if (normalized.includes('lembrar') || normalized.includes('memorizar') || normalized.includes('salvar')) {
      return 'memory_create';
    }
    if (normalized.includes('memória') || normalized.includes('memorias')) {
      return 'memory_read';
    }
    if (normalized.includes('apagar') || normalized.includes('deletar')) {
      return 'memory_delete';
    }
    if (normalized.includes('listar') || normalized.includes('mostrar')) {
      return 'memory_list';
    }
    if (normalized.includes('configuração') || normalized.includes('ajustes')) {
      return 'settings_open';
    }
    if (normalized.includes('ajuda') || normalized.includes('help')) {
      return 'help';
    }

    return 'chat';
  }

  async cleanup(): Promise<void> {
    if (this.listening) await this.stopListening();
    if (this.speaking) await this.stopSpeaking();
  }
}

// Export WebVoiceService as the default voice service
export { WebVoiceService as CapacitorVoiceService };