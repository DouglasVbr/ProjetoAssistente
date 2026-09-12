(function (global) {
  var NS = global.Phennellopy = global.Phennellopy || {};
  NS.Speech = { listen: function () {
    if (global.cordova && global.plugins && global.plugins.speechRecognition) return new Promise(function (resolve, reject) { plugins.speechRecognition.startListening(resolve, reject, { language: 'pt-BR', matches: 1 }); });
    if (!('webkitSpeechRecognition' in global || 'SpeechRecognition' in global)) return Promise.reject(new Error('Reconhecimento de voz indisponível neste navegador.'));
    return new Promise(function (resolve, reject) { var Recognition = global.SpeechRecognition || global.webkitSpeechRecognition; var recognition = new Recognition(); recognition.lang = 'pt-BR'; recognition.maxAlternatives = 1; recognition.onresult = function (e) { resolve([e.results[0][0].transcript]); }; recognition.onerror = function () { reject(new Error('Não foi possível reconhecer sua voz.')); }; recognition.start(); });
  } };
})(window);
