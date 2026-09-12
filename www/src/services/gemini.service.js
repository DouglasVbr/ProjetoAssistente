(function (global) {
    var NS = global.Phennellopy = global.Phennellopy || {};

    var SYSTEM_PROMPT =
        'Você é Phennellopy, uma assistente de voz inteligente em português do Brasil. ' +
        'Responda de forma curta, clara e natural, ideal para ser lida em voz alta. ' +
        'Seja amigável, prestativa e direta. ' +
        'Evite formatações especiais, markdown ou caracteres que não sejam falados naturalmente. ' +
        'Nunca peça senhas, dados bancários ou informações sensíveis. ' +
        'Se não souber algo, admita honestamente.';

    NS.Gemini = {
        SYSTEM_PROMPT: SYSTEM_PROMPT,
        
        /**
         * Pergunta algo ao Gemini (com contexto de conversa mantido no servidor)
         * @param {string} prompt - Texto da pergunta
         * @returns {Promise<string>} Resposta do Gemini
         */
        ask: function (prompt) {
            var text = String(prompt || '').trim();
            if (!text) return Promise.reject(new Error('Pergunta vazia.'));
            
            console.log('[Gemini] Enviando pergunta:', text);
            
            return NS.Api.post('gemini', {
                prompt: text
            }).then(function (data) {
                var answer = data && data.text ? String(data.text).trim() : '';
                if (!answer) throw new Error('O Gemini não retornou texto.');
                
                console.log('[Gemini] Resposta recebida:', answer.substring(0, 100) + '...');
                return answer;
            }).catch(function (err) {
                console.error('[Gemini] Erro:', err);
                throw err;
            });
        },
        
        /**
         * Limpa o histórico de conversa do dispositivo atual
         * @returns {Promise<void>}
         */
        clearHistory: function () {
            console.log('[Gemini] Limpando histórico de conversa...');
            return NS.Api.delete('conversas').then(function () {
                console.log('[Gemini] Histórico limpo com sucesso');
            }).catch(function (err) {
                console.error('[Gemini] Erro ao limpar histórico:', err);
                throw err;
            });
        },
        
        /**
         * Verifica se o Gemini está habilitado
         * @returns {boolean}
         */
        isEnabled: function () {
            // O Gemini está sempre habilitado por padrão (configurado no servidor)
            return true;
        }
    };
})(window);
