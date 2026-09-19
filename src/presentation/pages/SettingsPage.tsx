/**
 * Settings Page - App configuration
 */

import React, { useState, useEffect } from 'react';
import { Page, Navbar, List, ListItem, Block, BlockTitle, Button, Input, Toggle, Icon, Link } from 'framework7-react';
import { useSettings } from '@hooks';
import { useAppStore } from '@stores';
import { useSync } from '@hooks';
import { hybridAIService } from '@data/services/ai/hybrid';
import { cn } from '@core/utils';

export function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const { syncStatus, sync, syncing } = useSync();
  const { aiProvider, setAIProvider, aiModels } = useAppStore();
  const [providerModels, setProviderModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(settings.aiModelConfig.model);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    loadProviderModels();
  }, [settings.aiProvider, aiModels]);

  const loadProviderModels = async () => {
    try {
      const models = await hybridAIService.getModels();
      const filtered = models
        .filter(m => m.startsWith(settings.aiProvider + ':'))
        .map(m => m.split(':')[1]);
      setProviderModels(filtered);
      if (filtered.length > 0 && !filtered.includes(selectedModel)) {
        setSelectedModel(filtered[0]);
      }
    } catch (error) {
      console.error('Load models error:', error);
    }
  };

  const handleProviderChange = async (provider: string) => {
    await updateSettings({ aiProvider: provider as any });
    setAIProvider(provider);
    setSelectedModel('');
    await loadProviderModels();
  };

  const handleModelChange = async (model: string) => {
    setSelectedModel(model);
    await updateSettings({
      aiModelConfig: { ...settings.aiModelConfig, model },
    });
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const available = await hybridAIService.isAvailable();
      if (available) {
        console.log('Connection successful');
      } else {
        console.log('Connection failed');
      }
    } catch (error) {
      console.error('Test connection error:', error);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveApiKey = async () => {
    console.log('API Key saved');
  };

  const handleResetSettings = async () => {
    if (window.confirm('Tem certeza que deseja restaurar as configurações padrão?')) {
      await updateSettings({
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
      });
      setAIProvider('openai');
    }
  };

  const handleExportData = async () => {
    const data = {
      settings,
      memories: useAppStore.getState().memories,
      messages: useAppStore.getState().messages,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phennellopy-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page name="settings" className="bg-black">
      <Navbar className="bg-black border-bottom-primary">
        <div className="navbar-inner">
          <div className="left">
            <Link href="/" className="link back txt-primary">
              <Icon f7="chevron_left" slot="icon-only" />
            </Link>
          </div>
          <div className="title txt-primary">Configurações</div>
        </div>
      </Navbar>

      <div className="page-content bg-black">
        <BlockTitle className="padding-horizontal txt-primary">Inteligência Artificial</BlockTitle>
        <List>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Provedor de IA</div>
              <div className="item-after">
                <select
                  value={settings.aiProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="input-custom border-bottom-primary bg-black txt-primary"
                  style={{ width: 'auto', padding: '4px 8px' }}
                >
                  <option value="auto">Automático (Fallback)</option>
                  <option value="openai">OpenAI (Cloud)</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="azure">Azure OpenAI</option>
                </select>
              </div>
            </div>
          </ListItem>
          
          {providerModels.length > 0 && (
            <ListItem className="txt-primary">
              <div className="item-inner">
                <div className="item-title">Modelo</div>
                <div className="item-after">
                  <select
                    value={selectedModel}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="input-custom border-bottom-primary bg-black txt-primary"
                    style={{ width: 'auto', padding: '4px 8px' }}
                  >
                    {providerModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </ListItem>
          )}

          {settings.aiProvider === 'openai' && (
            <ListItem className="txt-primary">
              <div className="item-inner">
                <div className="item-title">API Key OpenAI</div>
                <div className="item-after">
                  <div className="flex gap-2">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="input-custom border-bottom-primary flex-1"
                      style={{ maxWidth: '200px' }}
                    />
                    <Button
                      fill
                      small
                      className="bg-primary"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      <Icon f7={showApiKey ? 'eye_slash' : 'eye'} size={18} />
                    </Button>
                    <Button
                      fill
                      small
                      className="bg-success"
                      onClick={handleSaveApiKey}
                    >
                      Salvar
                    </Button>
                  </div>
                </div>
              </div>
            </ListItem>
          )}

          {settings.aiProvider === 'ollama' && (
            <ListItem className="txt-primary">
              <div className="item-inner">
                <div className="item-title">URL do Ollama</div>
                <div className="item-after">
                  <Input
                    type="text"
                    placeholder="http://localhost:11434"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    className="input-custom border-bottom-primary"
                    style={{ maxWidth: '200px' }}
                  />
                </div>
              </div>
            </ListItem>
          )}

          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Testar Conexão</div>
              <div className="item-after">
                <Button
                  fill
                  small
                  className="bg-primary"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                >
                  {testingConnection ? 'Testando...' : 'Testar'}
                </Button>
              </div>
            </div>
          </ListItem>
        </List>

        <BlockTitle className="padding-horizontal txt-primary">Voz</BlockTitle>
        <List>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Idioma</div>
              <div className="item-after">
                <select
                  value={settings.voiceSettings.language}
                  onChange={(e) => updateSettings({ voiceSettings: { ...settings.voiceSettings, language: e.target.value } })}
                  className="input-custom border-bottom-primary bg-black txt-primary"
                  style={{ width: 'auto', padding: '4px 8px' }}
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Español</option>
                </select>
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Velocidade</div>
              <div className="item-after">
                <Input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={settings.voiceSettings.rate}
                  onChange={(e) => updateSettings({ voiceSettings: { ...settings.voiceSettings, rate: parseFloat(e.target.value) } })}
                  style={{ width: '120px' }}
                />
                <span className="txt-primary opacity-70 ml-2">{settings.voiceSettings.rate.toFixed(1)}x</span>
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Tom</div>
              <div className="item-after">
                <Input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={settings.voiceSettings.pitch}
                  onChange={(e) => updateSettings({ voiceSettings: { ...settings.voiceSettings, pitch: parseFloat(e.target.value) } })}
                  style={{ width: '120px' }}
                />
                <span className="txt-primary opacity-70 ml-2">{settings.voiceSettings.pitch.toFixed(1)}</span>
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Volume</div>
              <div className="item-after">
                <Input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.voiceSettings.volume}
                  onChange={(e) => updateSettings({ voiceSettings: { ...settings.voiceSettings, volume: parseFloat(e.target.value) } })}
                  style={{ width: '120px' }}
                />
                <span className="txt-primary opacity-70 ml-2">{Math.round(settings.voiceSettings.volume * 100)}%</span>
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Falar automaticamente</div>
              <div className="item-after">
                <Toggle
                  checked={settings.autoSpeak}
                  onChange={(e) => updateSettings({ autoSpeak: e.target.checked })}
                />
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Wake Word</div>
              <div className="item-after">
                <Toggle
                  checked={settings.wakeWordEnabled}
                  onChange={(e) => updateSettings({ wakeWordEnabled: e.target.checked })}
                />
              </div>
            </div>
          </ListItem>
          {settings.wakeWordEnabled && (
            <ListItem className="txt-primary">
              <div className="item-inner">
                <div className="item-title">Palavra de ativação</div>
                <div className="item-after">
                  <Input
                    type="text"
                    value={settings.wakeWord}
                    onChange={(e) => updateSettings({ wakeWord: e.target.value.toLowerCase() })}
                    className="input-custom border-bottom-primary"
                    style={{ maxWidth: '150px', textAlign: 'right' }}
                  />
                </div>
              </div>
            </ListItem>
          )}
        </List>

        <BlockTitle className="padding-horizontal txt-primary">Aparência</BlockTitle>
        <List>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Tema</div>
              <div className="item-after">
                <select
                  value={settings.theme}
                  onChange={(e) => updateSettings({ theme: e.target.value as any })}
                  className="input-custom border-bottom-primary bg-black txt-primary"
                  style={{ width: 'auto', padding: '4px 8px' }}
                >
                  <option value="dark">Escuro</option>
                  <option value="light">Claro</option>
                  <option value="system">Sistema</option>
                </select>
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Feedback tátil</div>
              <div className="item-after">
                <Toggle
                  checked={settings.hapticsEnabled}
                  onChange={(e) => updateSettings({ hapticsEnabled: e.target.checked })}
                />
              </div>
            </div>
          </ListItem>
        </List>

        <BlockTitle className="padding-horizontal txt-primary">Sincronização</BlockTitle>
        <List>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Sincronização automática</div>
              <div className="item-after">
                <Toggle
                  checked={settings.syncEnabled}
                  onChange={(e) => updateSettings({ syncEnabled: e.target.checked })}
                />
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Intervalo (minutos)</div>
              <div className="item-after">
                <Input
                  type="number"
                  min="1"
                  max="1440"
                  value={settings.syncInterval}
                  onChange={(e) => updateSettings({ syncInterval: parseInt(e.target.value) || 15 })}
                  className="input-custom border-bottom-primary"
                  style={{ maxWidth: '80px', textAlign: 'right' }}
                />
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Última sincronização</div>
              <div className="item-after txt-primary opacity-70">
                {syncStatus.lastSync 
                  ? syncStatus.lastSync.toLocaleString('pt-BR')
                  : 'Nunca'
                }
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">Pendentes</div>
              <div className="item-after txt-primary">
                {syncStatus.pendingChanges}
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary" onClick={sync}>
            <div className="item-inner">
              <div className="item-title">Sincronizar agora</div>
              <div className="item-after">
                {syncing && <Icon f7="arrow_2_circlepath" className="animate-spin" size={20} />}
              </div>
            </div>
          </ListItem>
        </List>

        <BlockTitle className="padding-horizontal txt-primary">Dados</BlockTitle>
        <List>
          <ListItem className="txt-primary" onClick={handleExportData}>
            <div className="item-inner">
              <div className="item-title">
                <Icon f7="square_arrow_up" slot="media" className="txt-primary" />
                Exportar dados
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary">
            <div className="item-inner">
              <div className="item-title">
                <Icon f7="square_arrow_down" slot="media" className="txt-primary" />
                Importar dados
              </div>
            </div>
          </ListItem>
          <ListItem className="txt-primary" onClick={handleResetSettings}>
            <div className="item-inner">
              <div className="item-title">
                <Icon f7="arrow_clockwise" slot="media" className="txt-danger" />
                Restaurar padrões
              </div>
            </div>
          </ListItem>
        </List>

        <BlockTitle className="padding-horizontal txt-primary">Sobre</BlockTitle>
        <List>
          <ListItem title="Versão" after="2.0.0" className="txt-primary" />
          <ListItem title="Desenvolvedor" after="Douglas" className="txt-primary" />
          <ListItem title="Licença" after="MIT" className="txt-primary" />
        </List>

        <Block className="padding-horizontal padding-bottom">
          <Button fill large className="bg-danger" onClick={handleResetSettings}>
            Restaurar Configurações Padrão
          </Button>
        </Block>
      </div>
    </Page>
  );
}