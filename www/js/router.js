
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





          app.views.main.router.navigate('/memorias/');
        }
      }
    },
    {
      path: '/memorias/',
      url: 'memorias.html',
      on: {
        pageInit: function (e, page) {
              
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
          })

        },
      }
      



    },
  ],
  // ... other parameters
});

var mainView = app.views.create('.view-main');