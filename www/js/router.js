
document.addEventListener('deviceready', onDeviceReady, false);

var app = new Framework7({
  // App root element
  el: '#app',
  // App Name
  name: 'dunga teste',
  // App id
  id: 'br.com.dunga.teste',
  // Enable swipe panel
  panel: {
    swipe: true,
  },
  // Add default routes
  routes: [
    {
      path: '/index/',
      url: 'index.html',
      on: {

        pageInit: function (e, page) {
          
          $.getScript ('js/index.js');




          app.views.main.router.navigate('/memorias/');
        }
      }
    },
    {
      path: '/memorias/',
      url: 'memorias.html',
      on: {
        pageInit: function (e, page) {
          $.getScript ('js/memorias.js');
              
          

        },
      }
      



    },
  ],
  // ... other parameters
});

function onDeviceReady(){
  var mainView = app.views.create('.view-main', {url:'/index/'});

}

