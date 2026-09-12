(function (global) {
  var NS = global.Phennellopy = global.Phennellopy || {};
  function toast(message) { if (global.app && app.toast) { app.toast.create({ text: message, closeTimeout: 1800, position: 'center' }).open(); } }
  NS.Status = { listening: function () { toast('Ouvindo…'); }, processing: function () { toast('Processando…'); }, speaking: function () { toast('Preparando resposta…'); }, success: function (m) { toast(m); }, error: function (m) { toast(m); }, hide: function () {} };
})(window);
