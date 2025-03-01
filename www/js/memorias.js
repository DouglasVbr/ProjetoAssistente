// Inicialização do search bar
var searchbar = app.searchbar.create({
    el: '.searchbar',
    searchContainer: '.list', // Deve corresponder à classe da lista
    searchIn: '.item-title',  // Deve corresponder à classe do texto filtrável
    on: {
        search: function (sb, query, previousQuery) {
            console.log('Search query:', query);
        },
        enable: function () {
            console.log('Searchbar enabled');
        }
    }
});

// BANCO DE DADOS LOCAL WEBSQL
var db = window.openDatabase("Banco", "1.0", "Banco", 25000000);

db.transaction(criarTabela, function (err) {
    app.dialog.alert('Erro ao criar tabela: ' + err);
}, function () {
    console.log('Sucesso ao criar tabela');
});

// FUNÇÃO RESPONSÁVEL POR CRIAR TABELA NO NOSSO BANCO
function criarTabela(tx) {
    tx.executeSql("CREATE TABLE IF NOT EXISTS memorias (id INTEGER primary key, p_escrita varchar(255), p_falada varchar(255), r_escrita varchar(255), r_falada varchar(255))");
}

// FUNÇÃO PARA LISTAR OS ITENS DO BANCO
function listarMemorias() {
    db.transaction(selecionarTudo, function (err) {
        app.dialog.alert('Erro ao realizar transação Selecionar Tudo: ' + err);
    }, function () {
        console.log('Sucesso ao realizar Transação Selecionar Tudo!');
    });
}

// FUNÇÃO PARA SELECIONAR TUDO 
function selecionarTudo(tx) {
    tx.executeSql("SELECT * FROM memorias ORDER BY id", [], function (tx, dados) {
        var linhas = dados.rows.length;
        if (linhas === 0) {
            $("#comMemorias").addClass('display-none');
            $("#semMemorias").removeClass('display-none');
        } else {
            $("#comMemorias").removeClass('display-none');
            $("#semMemorias").addClass('display-none');
            $("#qtAprendidas").html(linhas);
            $("#listaPerguntas").empty();
            for (var i = 0; i < linhas; i++) {
                $("#listaPerguntas").append(`
                    <li>
                        <a href="#" data-id="${dados.rows.item(i).id}" data-pescrita="${dados.rows.item(i).p_escrita}" data-pfalada="${dados.rows.item(i).p_falada}" data-rescrita="${dados.rows.item(i).r_escrita}" data-rfalada="${dados.rows.item(i).r_falada}" data-popup=".popup-resposta" class="item-link item-content popup-open">
                            <div class="item-inner">
                                <div class="item-title-row">
                                    <div class="item-title fw-bold"><i class="mdi mdi-pencil"></i>${dados.rows.item(i).p_escrita}</div>
                                    <div class="item-after"><span class="badge padding-left padding-right color-blue">ID: ${dados.rows.item(i).id}</span></div>
                                </div>
                                <div class="item-subtitle"><i class="mdi mdi-microphone"></i>${dados.rows.item(i).p_falada}</div>
                            </div>
                        </a>
                    </li>`);
            }

            $(".item-link").on('click', function () {
                var idItem = $(this).attr('data-id');
                var itemRespostaEscrita = $(this).attr('data-rescrita');
                var itemRespostaFalada = $(this).attr('data-rfalada');
                $("#idDoItem").html('ID' + idItem);
                if (itemRespostaEscrita && itemRespostaEscrita !== "null") {
                    $("#input_rescrita").val(itemRespostaEscrita);
                }
                if (itemRespostaFalada && itemRespostaFalada !== "null") {
                    $("#input_rfalada").val(itemRespostaFalada);
                }
                $("#input_rescrita").focus();
            });
        }
    });
}

//SAIU DO CAMPO INPUT R ESCRITA
$("#input_rescrita").on('blur', function () {
    $("#input_rfalada").val($(this).val()); // Agora transfere corretamente o valor
});


// CLICOU NO BOTÃO PARA ASSISTENTE FALAR
$("#BtnFalarResposta").on('click', function () {
    // RECUPERA O VALOR DO INPUT R FALADO
    var fala = $("#input_rfalada").val();

    TTS.speak({
        text: fala,
        locale: 'pt-BR',
        rate: 0.75
    }, function () {
        console.log('Assistente falou!');

    }, function (reason) {
        app.dialog.alert('Houve um Erro:' + erro);
    });
});

// CLICOU NO BOTÃO PARA SALVAR RESPOSTAS
$("#salvarRespostas").on('click', function () {
    // RECUPERA O VALOR DO INPUT R ESCRITA
    var escrita = $("#input_rescrita").val();
    // RECUPERA O VALOR DO INPUT R FALADA
    var falada = $("#input_rfalada").val();

    db.transaction(atualizarTabela,
        function (err) {
            app.dialog.alert('Erro ao atualizar tabela:' + err);
        }, function () {
            console.log('Sucesso ao atualizar tabela');
        });

        function atualizarTabela(tx){
          tx.executeSql("")
        }
         

});



// CLICOU EM GRAVAR PERGUNTA
$("#gravarPergunta").on("click", function () {
    let options = { language: "pt-BR", showPopup: false, showPartial: true };
    window.plugins.speechRecognition.startListening(
        function (dados) {
            $.each(dados, function (index, texto) {
                $("#perguntaEntendida").val(texto);
            });
        },
        function (erro) {
            app.dialog.alert('Houve um erro: ' + erro);
        }, options);
});

// CLICOU EM SALVAR PERGUNTA
$("#salvarPergunta").on("click", function () {
    var pergunta_escrita = $("#perguntaEscrita").val().trim();
    var pergunta_falada = $("#perguntaEntendida").val().trim();
    if (!pergunta_escrita || !pergunta_falada) {
        app.dialog.alert("Por favor, preencha todos os campos");
    } else {
        db.transaction(function (tx) {
            tx.executeSql("INSERT INTO memorias (p_escrita, p_falada) VALUES (?, ?)",
                [pergunta_escrita, pergunta_falada],
                function () {
                    app.toast.create({
                        icon: '<i class="mdi mdi-content-save"></i>',
                        text: 'Salvo',
                        position: 'center',
                        closeTimeout: 2000
                    }).open();
                    $("#perguntaEscrita, #perguntaEntendida").val("");
                    $("#perguntaEscrita").focus();
                    listarMemorias();
                },
                function (err) {
                    app.dialog.alert('Erro na transação Inserir: ' + err.message);
                }
            );
        });
    }
});

// CLICOU EM APAGAR MEMÓRIAS
$("#apagarMemorias").on("click", function () {
    app.dialog.confirm('Tem certeza que quer apagar as memórias?', '<strong>Confirmação</strong>', function () {
        db.transaction(apagaBanco, function (err) {
            app.dialog.alert('Erro ao apagar banco de dados: ' + err);
        }, function () {
            app.views.main.router.refreshPage();
        });
    });
});

function apagaBanco(tx) {
    tx.executeSql("DROP TABLE IF EXISTS memorias", [],
        function () {
            app.dialog.alert('Nada mais faz sentido...', '<strong>Memórias Apagadas</strong>');
        },
        function (err) {
            app.dialog.alert('Falha ao apagar memórias: ' + err);
        }
    );
}
