(function (global) {
  var NS = global.Phennellopy = global.Phennellopy || {};
  NS.MemoryRepository = {
    list: function (query) { return NS.Api.get('memorias' + (query ? '?q=' + encodeURIComponent(query) : '')); },
    create: function (data) { return NS.Api.post('memorias', data); },
    update: function (id, data) { return NS.Api.put('memorias/' + encodeURIComponent(id), data); },
    clear: function () { return NS.Api.del('memorias'); }
  };
})(window);
