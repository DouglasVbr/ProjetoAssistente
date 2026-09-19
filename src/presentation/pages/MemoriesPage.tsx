/**
 * Memories Page - Manage learned question/answer pairs
 */

import React, { useState, useEffect } from 'react';
import { Page, Navbar, List, ListItem, Searchbar, Fab, FabButton, Icon, Popup, View, Block, BlockTitle, Input, Button, Link } from 'framework7-react';
import { useMemories } from '@hooks';
import { useHaptics } from '@hooks';
import { useAppStore } from '@stores';
import { cn } from '@core/utils';

export function MemoriesPage() {
  const { memories, loading, loadMemories, createMemory, deleteMemory, deleteAllMemories } = useMemories();
  const { settings, setSettings } = useAppStore();
  const { impact, notification } = useHaptics();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionVoice, setNewQuestionVoice] = useState('');
  const [newAnswerText, setNewAnswerText] = useState('');
  const [newAnswerVoice, setNewAnswerVoice] = useState('');
  const [editingMemory, setEditingMemory] = useState<typeof memories[0] | null>(null);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const filteredMemories = memories.filter(m => 
    m.questionText.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.questionVoice.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.answerText.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateMemory = async () => {
    if (!newQuestionText.trim() || !newAnswerText.trim()) {
      notification('error');
      return;
    }

    try {
      await createMemory({
        questionText: newQuestionText.trim(),
        questionVoice: newQuestionVoice.trim() || newQuestionText.trim(),
        answerText: newAnswerText.trim(),
        answerVoice: newAnswerVoice.trim() || newAnswerText.trim(),
      });
      
      setShowAddPopup(false);
      setNewQuestionText('');
      setNewQuestionVoice('');
      setNewAnswerText('');
      setNewAnswerVoice('');
      notification('success');
      impact('medium');
    } catch (error) {
      console.error('Create memory error:', error);
      notification('error');
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      await deleteMemory(id);
      notification('success');
      impact('medium');
    } catch (error) {
      console.error('Delete memory error:', error);
      notification('error');
    }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteAllMemories();
      setShowDeleteConfirm(false);
      notification('success');
      impact('heavy');
    } catch (error) {
      console.error('Delete all memories error:', error);
      notification('error');
    }
  };

  const handleEditMemory = (memory: typeof memories[0]) => {
    setEditingMemory(memory);
    setNewQuestionText(memory.questionText);
    setNewQuestionVoice(memory.questionVoice);
    setNewAnswerText(memory.answerText);
    setNewAnswerVoice(memory.answerVoice);
    setShowAddPopup(true);
  };

  const handleUpdateMemory = async () => {
    if (!editingMemory || !newQuestionText.trim() || !newAnswerText.trim()) return;

    try {
      await createMemory({
        questionText: newQuestionText.trim(),
        questionVoice: newQuestionVoice.trim() || newQuestionText.trim(),
        answerText: newAnswerText.trim(),
        answerVoice: newAnswerVoice.trim() || newAnswerText.trim(),
      });
      
      await deleteMemory(editingMemory.id);
      
      setShowAddPopup(false);
      setEditingMemory(null);
      setNewQuestionText('');
      setNewQuestionVoice('');
      setNewAnswerText('');
      setNewAnswerVoice('');
      notification('success');
      impact('medium');
    } catch (error) {
      console.error('Update memory error:', error);
      notification('error');
    }
  };

  return (
    <Page name="memories" className="bg-black">
      <Navbar className="bg-black border-bottom-primary">
        <div className="navbar-inner">
          <div className="left">
            <Link href="/" className="link back txt-primary">
              <Icon f7="chevron_left" slot="icon-only" />
            </Link>
          </div>
          <div className="title txt-primary">
            <Icon f7="brain" /> Memórias
          </div>
          <div className="right">
            {memories.length > 0 && (
              <Link className="link txt-danger" onClick={() => setShowDeleteConfirm(true)}>
                <Icon f7="trash" size={22} />
              </Link>
            )}
          </div>
        </div>
      </Navbar>

      <Searchbar
        placeholder="Procurar memórias..."
        searchContainer=".memories-list"
        searchIn=".item-title, .item-subtitle"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="bg-black border-bottom-primary"
      />

      <div className="page-content bg-black">
        {memories.length === 0 ? (
          <div className="block block-strong text-align-center padding-vertical-40">
            <Icon f7="brain" size={64} className="txt-primary opacity-30 mb-4" />
            <BlockTitle className="txt-primary">Nenhuma memória aprendida</BlockTitle>
            <p className="txt-primary opacity-70">
              Adicione perguntas e respostas para ensinar a Phennellopy
            </p>
          </div>
        ) : (
          <>
            <BlockTitle className="padding-horizontal txt-primary">
              Aprendidas (<b>{memories.length}</b>)
            </BlockTitle>
            <List className="memories-list" mediaList>
              {filteredMemories.map((memory) => (
                <ListItem
                  key={memory.id}
                  title={memory.questionText}
                  subtitle={memory.questionVoice}
                  className="bg-black txt-primary"
                  onClick={() => handleEditMemory(memory)}
                >
                  <Icon slot="media" f7="pencil" className="txt-primary" />
                  <span slot="after" className="badge color-blue">ID: {memory.id.slice(0, 8)}</span>
                </ListItem>
              ))}
            </List>
          </>
        )}
      </div>

      <Fab position="center-bottom">
        <FabButton onClick={() => { setEditingMemory(null); setShowAddPopup(true); }} className="bg-primary">
          <Icon f7="plus" size={28} className="txt-white" />
        </FabButton>
      </Fab>

      <Popup opened={showAddPopup} onPopupClosed={() => { setShowAddPopup(false); setEditingMemory(null); }}>
        <View>
          <Page>
            <Navbar className="bg-black">
              <div className="navbar-inner">
                <div className="title txt-primary">{editingMemory ? 'Editar Memória' : 'Nova Memória'}</div>
                <div className="right">
                  <Link className="link popup-close txt-primary">Cancelar</Link>
                </div>
              </div>
            </Navbar>
            <div className="page-content bg-black padding">
              <Block className="bg-black">
                <div className="list no-hairlines-md">
                  <ul>
                    <li className="item-content item-input">
                      <div className="item-inner">
                        <div className="item-title item-label txt-primary fw-bold">Pergunta (Texto)</div>
                        <div className="item-input-wrap">
                          <Input
                            type="text"
                            placeholder="Como você quer que ela entenda?"
                            value={newQuestionText}
                            onChange={(e) => setNewQuestionText(e.target.value)}
                            className="input-custom border-bottom-primary"
                          />
                        </div>
                      </div>
                    </li>
                    <li className="item-content item-input">
                      <div className="item-inner">
                        <div className="item-title item-label txt-primary fw-bold">Pergunta (Voz)</div>
                        <div className="item-input-wrap">
                          <Input
                            type="text"
                            placeholder="Como ela vai ouvir (opcional)"
                            value={newQuestionVoice}
                            onChange={(e) => setNewQuestionVoice(e.target.value)}
                            className="input-custom border-bottom-primary"
                          />
                        </div>
                      </div>
                    </li>
                    <li className="item-content item-input">
                      <div className="item-inner">
                        <div className="item-title item-label txt-primary fw-bold">Resposta (Texto)</div>
                        <div className="item-input-wrap">
                          <Input
                            type="text"
                            placeholder="O que ela deve responder"
                            value={newAnswerText}
                            onChange={(e) => setNewAnswerText(e.target.value)}
                            className="input-custom border-bottom-primary"
                          />
                        </div>
                      </div>
                    </li>
                    <li className="item-content item-input">
                      <div className="item-inner">
                        <div className="item-title item-label txt-primary fw-bold">Resposta (Voz)</div>
                        <div className="item-input-wrap">
                          <Input
                            type="text"
                            placeholder="Como ela deve falar (opcional)"
                            value={newAnswerVoice}
                            onChange={(e) => setNewAnswerVoice(e.target.value)}
                            className="input-custom border-bottom-primary"
                          />
                        </div>
                      </div>
                    </li>
                  </ul>
                </div>
              </Block>

              <div className="block block-strong padding-horizontal">
                <Button
                  fill
                  large
                  className={cn('bg-primary', editingMemory ? 'bg-warning' : '')}
                  onClick={editingMemory ? handleUpdateMemory : handleCreateMemory}
                >
                  {editingMemory ? 'Atualizar' : 'Salvar'}
                </Button>
              </div>
            </div>
          </Page>
        </View>
      </Popup>

      <Popup opened={showDeleteConfirm} onPopupClosed={() => setShowDeleteConfirm(false)}>
        <View>
          <Page>
            <Navbar className="bg-black">
              <div className="navbar-inner">
                <div className="title txt-danger">Confirmar Exclusão</div>
                <div className="right">
                  <Link className="link popup-close txt-primary">Cancelar</Link>
                </div>
              </div>
            </Navbar>
            <div className="page-content bg-black padding text-align-center">
              <Icon f7="exclamationmark_triangle" size={48} className="txt-warning mb-4" />
              <BlockTitle className="txt-primary">Apagar todas as memórias?</BlockTitle>
              <p className="txt-primary opacity-70">
                Esta ação não pode ser desfeita. Todas as {memories.length} memórias serão removidas permanentemente.
              </p>
              <div className="block block-strong padding-horizontal margin-top">
                <Button fill large className="bg-danger" onClick={handleDeleteAll}>
                  Sim, Apagar Tudo
                </Button>
              </div>
            </div>
          </Page>
        </View>
      </Popup>
    </Page>
  );
}