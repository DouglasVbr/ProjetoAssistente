/**
 * Ambientes da API (Dev vs Prod).
 * Troque MODE ou grave `phennellopy_mode` / `phennellopy_api_base` no localStorage.
 *
 * Android emulador -> host da máquina: http://10.0.2.2/...
 * Celular físico   -> IP da LAN, ex.: http://192.168.0.15/...
 */
(function (global) {
    var NS = global.Phennellopy = global.Phennellopy || {};

    NS.ENV = {
        MODE: 'dev',
        DEV: {
            // Use 10.0.2.2 para emulador Android, ou 192.168.1.63 para dispositivo físico
            API_BASE: window.location.origin + '/api',
            API_BASE_EMULATOR: 'http://10.0.2.2/ProjetoAssistente/api',
            LLM_BASE: 'https://api.anthropic.com'
        },
        PROD: {
            API_BASE: 'https://seu-dominio.com/api',
            LLM_BASE: 'https://api.anthropic.com'
        }
    };

    NS.Config = {
        getMode: function () {
            try {
                return localStorage.getItem('phennellopy_mode') || NS.ENV.MODE;
            } catch (e) {
                return NS.ENV.MODE;
            }
        },
        current: function () {
            var mode = String(this.getMode() || 'dev').toUpperCase();
            return NS.ENV[mode] || NS.ENV.DEV;
        },
        apiBase: function () {
            var override = '';
            try {
                override = localStorage.getItem('phennellopy_api_base') || '';
            } catch (e) { /* ignore */ }
            var base = override || this.current().API_BASE || '';
            return String(base).replace(/\/+$/, '');
        },
        llmBase: function () {
            return String(this.current().LLM_BASE || 'https://api.anthropic.com').replace(/\/+$/, '');
        },
        setApiBase: function (url) {
            try {
                localStorage.setItem('phennellopy_api_base', String(url || '').replace(/\/+$/, ''));
            } catch (e) { /* ignore */ }
        }
    };
})(window);
