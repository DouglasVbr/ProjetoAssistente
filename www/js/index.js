/**
 * Página Inicial - Assistente de Voz Phennellopy
 * Sistema híbrido: Comandos locais rápidos + IA (LLM) para inteligência geral
 */
(function () {
    var NS = window.Phennellopy;
    if (!NS) {
        console.error('[index.js] Namespace Phennellopy não encontrado');
        return;
    }

    // ========== COMANDOS DE SISTEMA (Locais) ==========
    var SYSTEM_COMMANDS = {
        'acessar memórias': function () {
            app.view.main.router.navigate('/memorias/');
        },
        'cessar memória': function () {
            app.view.main.router.navigate('/memorias/');
        },
        'abrir memórias': function () {
            app.view.main.router.navigate('/memorias/');
        },
        'limpar tela': function () {
            $('#pergunta').empty();
            $('#resposta').empty();
            NS.Status.success('Tela limpa', 1500);
        },
        'limpar histórico': function () {
            if (NS.Gemini && NS.Gemini.clearHistory) {
                NS.Gemini.clearHistory()
                    .then(function () {
                        return 'Histórico de conversa limpo com sucesso';
                    })
                    .catch(function (err) {
                        console.error('[index.js] Erro ao limpar histórico:', err);
                        return 'Não consegui limpar o histórico';
                    });
            }
            return 'Função não disponível';
        },
        'esquecer conversa': function () {
            if (NS.Gemini && NS.Gemini.clearHistory) {
                NS.Gemini.clearHistory()
                    .then(function () {
                        return 'Esqueci nossa conversa anterior';
                    })
                    .catch(function (err) {
                        console.error('[index.js] Erro ao limpar histórico:', err);
                        return 'Não consegui esquecer a conversa';
                    });
            }
            return 'Função não disponível';
        },
        'qual é o seu nome': function () {
            return 'Meu nome é Phennellopy';
        },
        'qual seu nome': function () {
            return 'Meu nome é Phennellopy';
        },
        'quem é você': function () {
            return 'Sou Phennellopy, sua assistente de voz em português';
        }
    };

    // ========== PROCESSAMENTO DE COMANDO ==========
    function processCommand(text) {
        var normalized = String(text || '').toLowerCase().trim();
        if (!normalized) {
            NS.Status.error('Não entendi o que você disse');
            return Promise.resolve();
        }

        // Exibir a pergunta do usuário (texto seguro)
        NS.Escape.text($('#pergunta'), text);
        $('#pergunta').removeClass('display-none');

        // 1. Verificar comandos de sistema primeiro (execução local instantânea)
        var systemCmd = SYSTEM_COMMANDS[normalized];
        if (systemCmd) {
            var result = systemCmd();
            if (typeof result === 'string') {
                return speakAndDisplay(result);
            }
            if (result && typeof result.then === 'function') {
                return result.then(function(msg) {
                    if (msg) return speakAndDisplay(msg);
                    return Promise.resolve();
                });
            }
            return Promise.resolve();
        }

        // 2. Sistema de fallback inteligente: OpenJarvis → Gemini → Claude
        NS.Status.processing('ai');

        // Tentar OpenJarvis primeiro (IA local, se habilitado)
        if (NS.OpenJarvis && NS.OpenJarvis.isEnabled()) {
            console.log('[index.js] Tentando OpenJarvis primeiro...');
            return NS.OpenJarvis.ask(text)
                .then(function (answer) {
                    console.log('[index.js] ✓ Resposta do OpenJarvis recebida');
                    return speakAndDisplay(answer);
                })
                .catch(function (err) {
                    console.warn('[index.js] OpenJarvis falhou, tentando Gemini...', err);
                    // Fallback para Gemini
                    return NS.Gemini.ask(text)
                        .then(function (answer) {
                            console.log('[index.js] ✓ Resposta do Gemini recebida');
                            return speakAndDisplay(answer);
                        });
                })
                .catch(function (err) {
                    NS.Status.hide();
                    var msg = err && err.message ? err.message : 'Erro ao consultar IA';
                    app.dialog.alert(msg, 'Erro');
                    console.error('[index.js] Todos os sistemas de IA falharam:', err);
                });
        }

        // Se OpenJarvis não está habilitado, usar Gemini diretamente
        console.log('[index.js] OpenJarvis desabilitado, usando Gemini...');
        return NS.Gemini.ask(text)
            .then(function (answer) {
                console.log('[index.js] ✓ Resposta do Gemini recebida');
                return speakAndDisplay(answer);
            })
            .catch(function (err) {
                NS.Status.hide();
                var msg = err && err.message ? err.message : 'Erro ao consultar IA';
                app.dialog.alert(msg, 'Erro');
                console.error('[index.js]', err);
            });
    }

    // ========== FALAR E EXIBIR RESPOSTA ==========
    function speakAndDisplay(text) {
        NS.Status.speaking();

        // Exibir resposta com animação de digitação
        $('#resposta').empty();
        var typed = new Typed('#resposta', {
            strings: [NS.Escape.html(text)],
            typeSpeed: 40,
            showCursor: false,
            onComplete: function () {
                NS.Status.hide();
                NS.Status.success('Fala concluída', 2000);
            }
        });

        // Falar em paralelo
        return NS.TTS.speak(text).catch(function (err) {
            console.warn('[index.js] TTS falhou:', err);
        });
    }

    // ========== EVENTO: BOTÃO FALAR ==========
    var isBusy = false;
    var $voiceButton = $('#btnfalar');
    var defaultVoiceLabel = $voiceButton.find('.fab-text').text();

    function setVoiceState(label, icon, busy) {
        isBusy = busy;
        $voiceButton.attr('aria-disabled', busy ? 'true' : 'false');
        $voiceButton.find('.fab-text').text(label);
        $voiceButton.find('i').attr('class', 'mdi ' + icon);
        $voiceButton.toggleClass('is-busy', busy);
    }

    $('#btnfalar').on('click', function (event) {
        event.preventDefault();
        if (isBusy) return;
        // Limpar resposta anterior
        $('#resposta').empty();
        setVoiceState('Ouvindo…', 'mdi-microphone', true);

        NS.Status.listening();

        NS.Speech.listen()
            .then(function (results) {
                NS.Status.hide();
                if (!results || !results.length) {
                    NS.Status.error('Nenhuma fala detectada', 2000);
                    return;
                }
                // Pega o primeiro resultado (mais confiável)
                var text = String(results[0] || '').trim();
                if (!text) {
                    NS.Status.error('Não entendi o que você disse', 2000);
                    return;
                }
                    setVoiceState('Processando…', 'mdi-loading mdi-spin', true);
                    return processCommand(text);
            })
            .catch(function (err) {
                NS.Status.hide();
                setVoiceState(defaultVoiceLabel, 'mdi-microphone', false);
                var msg = err && err.message ? err.message : 'Erro no reconhecimento de voz';
                app.dialog.alert(msg, 'Erro');
                console.error('[index.js]', err);
            })
            .finally(function () {
                setVoiceState(defaultVoiceLabel, 'mdi-microphone', false);
            });
    });

    console.log('[index.js] Inicializado');
})();
