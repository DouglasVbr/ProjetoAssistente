/**
 * Assistant Tools - function-calling registry
 *
 * Defines the actions the AI is allowed to take on its own (save a memory,
 * search saved memories, change a setting, read the current date/time) and
 * executes them when a provider asks to call one. Kept in the presentation
 * layer, importing storage/store directly - the same pattern
 * `findMemoryMatch` in `hooks/index.ts` already uses - rather than routing
 * through the (currently unused) domain use-case classes, and deliberately
 * NOT importing from `hooks/index.ts` itself so that file can import this
 * one without a circular dependency.
 */

import { Capacitor } from '@capacitor/core';
import { sqliteService } from '../../data/storage/sqlite';
import { indexedDBService } from '../../data/storage/indexeddb';
import { useAppStore } from '../stores/app';
import type { AppSettings, ToolCall, ToolDefinition } from '../../domain/entities';

function memoryStore() {
  return Capacitor.isNativePlatform() ? sqliteService : indexedDBService;
}

/**
 * Settings the AI is allowed to change on its own. Anything else (sync,
 * data retention, notifications...) stays out of the model's reach on
 * purpose - a stray tool call shouldn't be able to touch those.
 */
const ALLOWED_SETTINGS = ['theme', 'autoSpeak', 'wakeWordEnabled', 'wakeWord', 'hapticsEnabled'] as const;
type AllowedSettingKey = (typeof ALLOWED_SETTINGS)[number];

function isAllowedSetting(key: string): key is AllowedSettingKey {
  return (ALLOWED_SETTINGS as readonly string[]).includes(key);
}

function coerceSettingValue(key: AllowedSettingKey, raw: string): unknown {
  if (key === 'autoSpeak' || key === 'wakeWordEnabled' || key === 'hapticsEnabled') {
    return raw === 'true' || raw === '1';
  }
  return raw;
}

export const assistantTools: ToolDefinition[] = [
  {
    name: 'save_memory',
    description:
      'Salva uma pergunta e sua resposta como memória permanente, para responder instantaneamente (sem chamar a IA) da próxima vez que o usuário perguntar algo parecido. Use quando o usuário pedir explicitamente para lembrar de algo, ou ensinar uma resposta fixa.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'A pergunta ou comando que deve disparar essa memória no futuro' },
        answer: { type: 'string', description: 'A resposta a guardar para essa pergunta' },
      },
      required: ['question', 'answer'],
    },
  },
  {
    name: 'search_memories',
    description: 'Busca nas memórias já salvas por um termo, para checar o que o usuário já ensinou antes de responder.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Termo ou pergunta a procurar nas memórias salvas' },
      },
      required: ['query'],
    },
  },
  {
    name: 'update_setting',
    description: `Altera uma configuração do app. Chaves permitidas: ${ALLOWED_SETTINGS.join(', ')}. Para "theme" use "dark", "light" ou "system"; para as demais use "true"/"false".`,
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: [...ALLOWED_SETTINGS], description: 'Nome da configuração a alterar' },
        value: { type: 'string', description: 'Novo valor da configuração' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'get_current_datetime',
    description: 'Retorna a data e a hora atuais. Use quando o usuário perguntar que horas são ou que dia é hoje.',
    parameters: { type: 'object', properties: {} },
  },
];

/**
 * Runs one tool call the AI asked for and returns a short text result to
 * feed back into the conversation as a 'tool' message. Never throws - a
 * failed tool returns an error string so the model can react to it (and
 * apologize, retry with different arguments, etc.) instead of crashing
 * the whole chat turn.
 */
export async function executeTool(call: ToolCall): Promise<string> {
  try {
    switch (call.name) {
      case 'save_memory': {
        const question = String(call.arguments.question ?? '').trim();
        const answer = String(call.arguments.answer ?? '').trim();
        if (!question || !answer) return 'Erro: os campos "question" e "answer" são obrigatórios.';

        const memory = await memoryStore().create({
          questionText: question,
          questionVoice: question,
          answerText: answer,
          answerVoice: answer,
        });
        useAppStore.getState().addMemory(memory);
        return `Memória salva: "${question}" → "${answer}".`;
      }

      case 'search_memories': {
        const query = String(call.arguments.query ?? '').trim().toLowerCase();
        if (!query) return 'Erro: o campo "query" é obrigatório.';

        const all = await memoryStore().findAll();
        const matches = all.filter(
          m =>
            m.questionText.toLowerCase().includes(query) ||
            m.questionVoice.toLowerCase().includes(query) ||
            m.answerText.toLowerCase().includes(query)
        );
        if (matches.length === 0) return `Nenhuma memória encontrada para "${query}".`;
        return matches
          .slice(0, 5)
          .map(m => `- "${m.questionText}" → "${m.answerText}"`)
          .join('\n');
      }

      case 'update_setting': {
        const key = String(call.arguments.key ?? '');
        if (!isAllowedSetting(key)) {
          return `Erro: configuração "${key}" não é permitida. Use uma de: ${ALLOWED_SETTINGS.join(', ')}.`;
        }
        const value = coerceSettingValue(key, String(call.arguments.value ?? ''));
        useAppStore.getState().setSettings({ [key]: value } as Partial<AppSettings>);
        return `Configuração "${key}" alterada para "${String(value)}".`;
      }

      case 'get_current_datetime':
        return new Date().toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' });

      default:
        return `Erro: ferramenta "${call.name}" desconhecida.`;
    }
  } catch (error) {
    return `Erro ao executar "${call.name}": ${error instanceof Error ? error.message : String(error)}`;
  }
}
