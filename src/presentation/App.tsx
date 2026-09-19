/**
 * Framework7 App Wrapper - Main app component with Framework7 integration
 */

import React, { useEffect } from 'react';
import { View, Page, Navbar, Toolbar, Link, Fab, FabButtons, FabButton, Icon, Block, BlockTitle, List, ListItem, Popup, Searchbar } from 'framework7-react';
import { ThemeProvider } from '@components/ThemeProvider';
import { MemoriesPage } from '@pages/MemoriesPage';
import { SettingsPage } from '@pages/SettingsPage';
import { useAppStore } from '@stores';
import { useAppInit, useTheme, useVoice, useChat, useMemories, useSettings, useSync, useHaptics } from '@hooks';
import { cn } from '@core/utils';

export function App() {
  const { initialized } = useAppStore();
  const { voiceService } = useAppInit();
  const { theme } = useTheme();
  const { isListening, isSpeaking, startListening, stopListening, speak, stopSpeaking } = useVoice();
  const { messages, sendMessage, streaming } = useChat();
  const { memories, loadMemories, createMemory, deleteMemory, deleteAllMemories } = useMemories();
  const { settings, updateSettings } = useSettings();
  const { syncStatus, sync } = useSync();
  const { impact } = useHaptics();

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleSendMessage = async (text: string) => {
    await impact('light');
    await sendMessage(text);
  };

  const handleVoiceToggle = async () => {
    await impact('medium');
    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  };

  const handleSpeakLast = async () => {
    const lastMessage = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastMessage) {
      await speak(lastMessage.content);
    }
  };

  if (!initialized) {
    return (
      <div className="app-root bg-black flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="txt-primary text-lg">Iniciando Phennellopy...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <View main url="/">
        <Page name="home" className="bg-black">
          <Navbar className="bg-black border-bottom-primary">
            <div className="navbar-inner justify-content-space-between">
              <div className="title txt-primary fw-bold">phennellopy.ia</div>
              <div className="right">
                <Link popupOpen=".popup-menu" className="link icon-only">
                  <Icon f7="ellipsis_vertical" className="txt-primary" size={24} />
                </Link>
              </div>
            </div>
          </Navbar>

          <div className="page-content bg-black flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 space-y-4" id="messages-container">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full txt-primary opacity-50">
                  <Icon f7="sparkles" size={64} className="mb-4" />
                  <p className="text-center px-4">Olá! Sou a Phennellopy, sua assistente pessoal.</p>
                  <p className="text-sm text-center px-4 mt-2 opacity-70">
                    Toque no microfone e fale comigo ou digite sua mensagem.
                  </p>
                </div>
              ) : (
                messages.map((msg: any) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex gap-3 max-w-[85%] animate-fade-in',
                      msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'
                    )}
                  >
                    <div
                      className={cn(
                        'rounded-2xl px-4 py-3 max-w-full',
                        msg.role === 'user'
                          ? 'bg-primary txt-white rounded-tr-none'
                          : 'bg-gray-900 txt-primary rounded-tl-none border border-primary/20'
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p className={cn('text-xs mt-1 opacity-50', msg.role === 'user' ? 'text-right' : '')}>
                        {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {streaming && (
                <div className="flex gap-3 self-start animate-pulse">
                  <div className="bg-gray-900 txt-primary rounded-2xl px-4 py-3 rounded-tl-none border border-primary/20">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-primary/20 bg-black">
              <div className="flex gap-2 items-center">
                <FabButton
                  onClick={handleVoiceToggle}
                  className={cn('fab-button', isListening ? 'bg-primary' : 'bg-gray-800 border border-primary/50')}
                >
                  <Icon f7={isListening ? 'mic_fill' : 'mic'} size={24} className={cn('txt-white', isListening ? 'animate-pulse' : '')} />
                </FabButton>
                
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Digite sua mensagem..."
                    className="w-full bg-gray-900 border border-primary/30 rounded-full px-4 py-3 txt-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        handleSendMessage(e.currentTarget.value.trim());
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                </div>
                
                <FabButton
                  onClick={() => {
                    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
                    if (input?.value.trim()) {
                      handleSendMessage(input.value.trim());
                      input.value = '';
                    }
                  }}
                  className="bg-primary"
                >
                  <Icon f7="arrow_up" size={20} className="txt-white" />
                </FabButton>
              </div>
            </div>
          </div>

          <Toolbar className="bg-black border-top-primary">
            <div className="toolbar-inner">
              <Link href="/" className="tab-link tab-link-active txt-primary">
                <Icon f7="chat_bubble_fill" size={22} />
                <span className="tabbar-label">Chat</span>
              </Link>
              <Link href="/memories/" className="tab-link txt-primary">
                <Icon f7="brain" size={22} />
                <span className="tabbar-label">Memórias</span>
              </Link>
              <Link href="/settings/" className="tab-link txt-primary">
                <Icon f7="gear" size={22} />
                <span className="tabbar-label">Ajustes</span>
              </Link>
            </div>
          </Toolbar>

          <Popup className="popup-menu">
            <View>
              <Page>
                <Navbar className="bg-black">
                  <div className="navbar-inner">
                    <div className="title txt-primary">Menu</div>
                    <div className="right">
                      <Link className="link popup-close txt-primary">Fechar</Link>
                    </div>
                  </div>
                </Navbar>
                <div className="page-content bg-black">
                  <List>
                    <ListItem link="/settings/" title="Configurações" className="txt-primary">
                      <Icon slot="media" f7="gear" className="txt-primary" />
                    </ListItem>
                    <ListItem title="Limpar Conversa" className="txt-primary" onClick={() => useAppStore.getState().clearMessages()}>
                      <Icon slot="media" f7="trash" className="txt-primary" />
                    </ListItem>
                    <ListItem title="Sincronizar Agora" className="txt-primary" onClick={sync}>
                      <Icon slot="media" f7="icloud" className="txt-primary" />
                    </ListItem>
                    <ListItem title="Exportar Dados" className="txt-primary">
                      <Icon slot="media" f7="square_arrow_up" className="txt-primary" />
                    </ListItem>
                  </List>
                </div>
              </Page>
            </View>
          </Popup>
        </Page>
      </View>
    </ThemeProvider>
  );
}