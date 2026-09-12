(function (global) {
  var NS = global.Phennellopy = global.Phennellopy || {};
  NS.Device = {
    id: function () {
      try {
        var key = 'phennellopy_device_id';
        var id = localStorage.getItem(key);
        if (!id) { id = 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(key, id); }
        return id;
      } catch (e) { return 'web_guest'; }
    }
  };
})(window);
