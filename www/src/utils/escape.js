(function (global) {
  var NS = global.Phennellopy = global.Phennellopy || {};
  function html(value) { return String(value == null ? '' : value).replace(/[&<>\"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]); }); }
  NS.Escape = { html: html, attr: html, text: function ($el, value) { $el.text(String(value == null ? '' : value)); } };
})(window);
