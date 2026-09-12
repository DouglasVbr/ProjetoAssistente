(function (global) {
    var NS = global.Phennellopy = global.Phennellopy || {};

    function timeoutFetch(url, options, ms) {
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = setTimeout(function () {
            if (ctrl) ctrl.abort();
        }, ms || 15000);
        var opts = Object.assign({}, options || {});
        if (ctrl) opts.signal = ctrl.signal;
        return fetch(url, opts).then(function (res) {
            clearTimeout(timer);
            return res;
        }).catch(function (err) {
            clearTimeout(timer);
            if (err && err.name === 'AbortError') {
                throw new Error('Tempo esgotado ao falar com a API.');
            }
            if (!navigator.onLine) {
                throw new Error('Sem conexão. Verifique a internet.');
            }
            throw new Error('Falha de rede ao falar com a API.');
        });
    }

    NS.Api = {
        request: function (method, path, body) {
            var base = NS.Config.apiBase();
            var url = base + '/' + String(path || '').replace(/^\/+/, '');
            var headers = {
                'Content-Type': 'application/json',
                'X-Device-Id': NS.Device.id()
            };
            var options = { method: method, headers: headers };
            if (body != null) options.body = JSON.stringify(body);
            return timeoutFetch(url, options, 20000).then(function (res) {
                return res.text().then(function (raw) {
                    var json = {};
                    try { json = raw ? JSON.parse(raw) : {}; } catch (e) {
                        throw new Error('Resposta inválida da API.');
                    }
                    if (!res.ok || json.ok === false) {
                        throw new Error(json.error || ('Erro HTTP ' + res.status));
                    }
                    return json.data;
                });
            });
        },
        get: function (path) { return this.request('GET', path); },
        post: function (path, body) { return this.request('POST', path, body); },
        put: function (path, body) { return this.request('PUT', path, body); },
        del: function (path) { return this.request('DELETE', path); },
        health: function () { return this.get('health'); }
    };
})(window);
