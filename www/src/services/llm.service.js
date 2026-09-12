(function (global) {
    var NS = global.Phennellopy = global.Phennellopy || {};

    var SYSTEM_PROMPT =
        'Você é Phennellopy, assistente de voz em português do Brasil. ' +
        'Responda de forma curta, clara e fácil de falar em voz alta. ' +
        'Nunca peça senhas, chaves de API ou dados bancários. ' +
        'Não invente memórias do usuário. Se não souber, diga que não sabe.';

    NS.LLM = {
        SYSTEM_PROMPT: SYSTEM_PROMPT,
        ask: function (prompt) {
            var text = String(prompt || '').trim();
            if (!text) return Promise.reject(new Error('Pergunta vazia.'));
            return NS.Api.post('llm', {
                prompt: text,
                system: SYSTEM_PROMPT
            }).then(function (data) {
                var answer = data && data.text ? String(data.text).trim() : '';
                if (!answer) throw new Error('A IA não retornou texto.');
                return answer;
            });
        }
    };
})(window);
