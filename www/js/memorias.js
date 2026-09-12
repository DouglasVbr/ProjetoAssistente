/**
 * Página de Memórias - CRUD via API REST MySQL
 */
(function () {
    var NS = window.Phennellopy;
    if (!NS || !NS.MemoryRepository) {
        console.error('[memorias.js] MemoryRepository não encontrado');
        return;
    }

    var currentItem = null;
    var memories = [];

    // ========== UI HELPERS ==========
    function renderMemories(items) {
        var $lista = $('#listaPerguntas');
        var $comMemorias = $('#comMemorias');
        var $semMemorias = $('#semMemorias');

        $lista.empty();

        if (!items || items.length === 0) {
            $comMemorias.addClass('display-none');
            $semMemorias.removeClass('display-none');
            return;
        }

        $semMemorias.addClass('display-none');
        $comMemorias.removeClass('display-none');
        $('#qtAprendidas').text(items.length);

        items.forEach(function (item) {
            // Escapar valores para prevenir XSS
            var id = NS.Escape.html(String(item.id || ''));
            var p_escrita = NS.Escape.html(item.p_escrita || '');
            var p_falada = NS.Escape.html(item.p_falada || '');
            var r_escrita = NS.Escape.attr(item.r_escrita);
            var r_falada = NS.Escape.attr(item.r_falada);

            $lista.append(
                '<li>' +
                '<a href="#" data-id="' + id + '" data-pescrita="' + p_escrita + '" data-pfalada="' + p_falada +
                '" data-rescrita="' + r_escrita + '" data-rfalada="' + r_falada +
                '" data-popup=".popup-resposta" class="item-link item-content popup-open">' +
                '<div class="item-inner">' +
                '<div class="item-title-row">' +
                '<div class="item-title fw-bold"><i class="mdi mdi-pencil"></i>' + p_escrita + '</div>' +
                '<div class="item-after"><span class="badge padding-left padding-right color-blue">ID: ' + id + '</span></div>' +
                '</div>' +
                '<div class="item-subtitle"><i class="mdi mdi-microphone"></i>' + p_falada + '</div>' +
                '</div>' +
                '</a>' +
                '</li>'
            );
        });

        // Bind events para os itens
        $('.item-link').off('click').on('click', function () {
            var $this = $(this);
            currentItem = {
                id: $this.attr('data-id'),
                p_escrita: $this.attr('data-pescrita'),
                p_falada: $this.attr('data-pfalada'),
                r_escrita: $this.attr('data-rescrita') !== 'null' ? $this.attr('data-rescrita') : '',
                r_falada: $this.attr('data-rfalada') !== 'null' ? $this.attr('data-rfalada') : ''
            };
            $('#idDoItem').text('ID: ' + currentItem.id);
            $('#input_rescrita').val(currentItem.r_escrita);
            $('#input_rfalada').val(currentItem.r_falada);
            $('#input_rescrita').focus();
        });
    }

    function loadMemories(query) {
        NS.Status.processing('api');

        var promise = query
            ? NS.MemoryRepository.list(query)
            : NS.MemoryRepository.list();

        promise
            .then(function (data) {
                NS.Status.hide();
                memories = Array.isArray(data) ? data : [];
                renderMemories(memories);
            })
            .catch(function (err) {
                NS.Status.hide();
                var msg = err && err.message ? err.message : 'Erro ao carregar memórias';
                app.dialog.alert(msg, 'Erro');
                console.error('[memorias.js]', err);
            });
    }

    // ========== SEARCH BAR ==========
    var searchbar = app.searchbar.create({
        el: '.searchbar',
        searchContainer: '.list',
        searchIn: '.item-title .item-subtitle',
        on: {
            search: function (sb, query) {
                loadMemories(query);
            },
            clear: function () {
                loadMemories('');
            }
        }
    });

    // ========== CARREGAR AO INICIAR ==========
    loadMemories();

    // ========== EVENTOS ==========

    // Transferir valor do input escrita para falada
    $('#input_rescrita').on('input blur', function () {
        $('#input_rfalada').val($(this).val());
    });

    // Falar resposta
    $('#BtnFalarResposta').on('click', function () {
        var text = $('#input_rfalada').val().trim();
        if (!text) {
            app.dialog.alert('Digite ou grave uma resposta primeiro');
            return;
        }
        NS.TTS.speak(text)
            .catch(function (err) {
                app.dialog.alert('Erro ao falar: ' + (err && err.message || err), 'Erro');
            });
    });

    // Salvar resposta atualizada
    $('#salvarRespostas').on('click', function () {
        if (!currentItem) {
            app.dialog.alert('Selecione uma memória primeiro', 'Erro');
            return;
        }
        var escrita = $('#input_rescrita').val().trim();
        var falada = $('#input_rfalada').val().trim();

        NS.Status.processing('api');

        NS.MemoryRepository.update(currentItem.id, {
            r_escrita: escrita,
            r_falada: falada
        })
            .then(function () {
                NS.Status.hide();
                app.toast.create({
                    icon: '<i class="mdi mdi-check"></i>',
                    text: 'Atualizada!',
                    closeTimeout: 2000
                }).open();
                $('.popup-resposta').find('.popup-close').click();
                loadMemories();
            })
            .catch(function (err) {
                NS.Status.hide();
                app.dialog.alert('Erro ao salvar: ' + (err && err.message || err), 'Erro');
            });
    });

    // Gravar pergunta com voz
    $('#gravarPergunta').on('click', function () {
        NS.Status.listening();

        NS.Speech.listen()
            .then(function (results) {
                NS.Status.hide();
                if (results && results.length) {
                    $('#perguntaEntendida').val(results[0]);
                }
            })
            .catch(function (err) {
                NS.Status.hide();
                app.dialog.alert('Erro no reconhecimento: ' + (err && err.message || err), 'Erro');
            });
    });

    // Salvar nova pergunta
    $('#salvarPergunta').on('click', function () {
        var pergunta_escrita = $('#perguntaEscrita').val().trim();
        var pergunta_falada = $('#perguntaEntendida').val().trim();

        if (!pergunta_escrita || !pergunta_falada) {
            app.dialog.alert('Preencha todos os campos', 'Aviso');
            return;
        }

        NS.Status.processing('api');

        NS.MemoryRepository.create({
            p_escrita: pergunta_escrita,
            p_falada: pergunta_falada
        })
            .then(function () {
                NS.Status.hide();
                app.toast.create({
                    icon: '<i class="mdi mdi-content-save"></i>',
                    text: 'Salvo!',
                    position: 'center',
                    closeTimeout: 2000
                }).open();
                $('#perguntaEscrita, #perguntaEntendida').val('');
                $('#perguntaEscrita').focus();
                $('.popup-pergunta').find('.popup-close').click();
                loadMemories();
            })
            .catch(function (err) {
                NS.Status.hide();
                app.dialog.alert('Erro ao salvar: ' + (err && err.message || err), 'Erro');
            });
    });

    // Apagar todas as memórias
    $('#apagarMemorias').on('click', function () {
        app.dialog.confirm(
            'Tem certeza que deseja apagar TODAS as memórias?',
            '<strong>Confirmação</strong>',
            function () {
                NS.Status.processing('api');

                NS.MemoryRepository.clear()
                    .then(function () {
                        NS.Status.hide();
                        app.dialog.alert('Memórias apagadas com sucesso', '<strong>Concluído</strong>');
                        loadMemories();
                    })
                    .catch(function (err) {
                        NS.Status.hide();
                        app.dialog.alert('Erro ao apagar: ' + (err && err.message || err), 'Erro');
                    });
            }
        );
    });

    console.log('[memorias.js] Inicializado');
})();