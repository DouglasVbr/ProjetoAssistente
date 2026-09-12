// Framework7 App Instance
var app = new Framework7({
  el: '#app',
  name: 'Phennellopy',
  id: 'br.com.phennellopy.assistente',
  panel: {
    swipe: true,
  },
  routes: [
    {
      path: '/index/',
      url: 'index.html',
      on: {
        pageInit: function () {
          // Carrega a lógica da página inicial
          $.getScript('js/index.js');
        }
      }
    },
    {
      path: '/memorias/',
      url: 'memorias.html',
      on: {
        pageInit: function () {
          // Carrega a lógica da página de memórias
          $.getScript('js/memorias.js');
        }
      }
    },
    {
      path: '/configuracoes/',
      url: 'configuracoes.html'
    },
  ]
});

// Aguarda o Cordova estar pronto antes de inicializar
document.addEventListener('deviceready', onDeviceReady, false);

// Fallback: Se não for Cordova (navegador), inicia após 1 segundo
setTimeout(function() {
  if (!window.cordova) {
    console.log('[Phennellopy] Modo navegador detectado - iniciando sem Cordova');
    onDeviceReady();
  }
}, 1000);

function onDeviceReady() {
  console.log('[Phennellopy] Cordova pronto');

  // Gating de autenticação (tela de login antes da interface)
  try {
    var NS = window.Phennellopy;
    if (NS && NS.Auth && !NS.Auth.isAuthenticated()) {
      window.location.href = 'login.html';
      return;
    }
  } catch (e) {
    /* ignore */
  }

  // Executa migração de dados legados (WebSQL -> API MySQL)
  if (window.Phennellopy && window.Phennellopy.Migration) {
    window.Phennellopy.Migration.run()
      .then(function(result) {
        if (result.imported > 0) {
          console.log('[Phennellopy] Migrados ' + result.imported + ' registros do WebSQL');
          app.toast.create({
            text: 'Memórias antigas importadas: ' + result.imported,
            closeTimeout: 3000,
            position: 'center'
          }).open();
        }
      })
      .catch(function(err) {
        console.warn('[Phennellopy] Erro na migração:', err);
      });
  }

  // Cria a view principal e navega para a página inicial
  app.views.create('.view-main', { url: '/index/' });
}
