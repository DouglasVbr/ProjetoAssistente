// assim que a rota index começar

//verificar se tem permissao de usar speechrecognition
window.plugins.speechRecognition.hasPermission(
    function (permissao) {
        // se não tiver permissao 
        if (!permissao) {

            // soliciatar a permissao
            window.plugins.speechRecognition.requestPermission(
                function (temPermissao) {
                    app.dialog.alert('Permissão concedida:', +temPermissao);
                }, function (erro) {
                    app.dialog.alert('Request Permission error:' + erro);
                })

        }

    }, function (error) {
        app.dialog.alert('hasPermission error:', +error)
    })



//clicou no botão falar
$("#btnfalar").on('click', function () {

    let options = {
        language: "pt-BR",
        showPopup: false,
        showPartial: true
    }

    // começou a escutar
    window.plugins.speechRecognition.startListening(
        //se sucesso
        function (dados) {
            $.each(dados, function (index, texto) {
                //colocar oque ela entende no p chamado pergunta 

                $("#pergunta").html("").append(texto);
                // pegar o valor do que ela entendeu
                var pergunta = $("#pergunta").html().toLowerCase();
                // verificar se o comando é essa
                if (pergunta == "acessar memórias" || pergunta == "cessar memória") {
                    app.view.main.router.navigate('/memorias/');
                }

                if (pergunta == "qual é o seu nome" || pergunta == "qual seu nome") {

                    // or with more options
                    TTS.speak({
                        text: 'Meu Nome é Phennellopy',
                        locale: 'pt-BR',
                        rate: 0.75
                     }, function () {
                        // se ela falar vai escrever na tela a resposta
                        var typed = new Typed('#resposta', {
                            strings: ['Meu Nome é Phennellopy ^1000', ''],
                            typeSpeed: 40,
                            showCursor:false,
                            onComplete: function(self){
                              toastBottom = app.toast.create({
                                    text: 'Fala Concluída Com Sucesso!',
                                    closeTimeout: 2000,
                                  });
                                  toastBottom.open();
                            }
                          });

                    }, function (reason) {
                        app.dialog.alert('Houve um Erro:'+erro);
                    });
                }
            })
        },
        //se erro
        function (erro) {
            app.dialog.alert('Houve um erro:' + erro);
        }, options)

});