/**
 * Serviço de Autenticação
 * Google OAuth, GitHub OAuth e SMS (Número de Celular)
 */
(function (global) {
    var NS = global.Phennellopy = global.Phennellopy || {};

    var TOKEN_KEY = 'phennellopy_auth_token';
    var USER_KEY = 'phennellopy_user';

    NS.Auth = {
        // Verifica se está autenticado
        isAuthenticated: function () {
            try {
                var token = localStorage.getItem(TOKEN_KEY);
                return !!token;
            } catch (e) {
                return false;
            }
        },

        // Obtém o token atual
        getToken: function () {
            try {
                return localStorage.getItem(TOKEN_KEY) || '';
            } catch (e) {
                return '';
            }
        },

        // Obtém os dados do usuário
        getUser: function () {
            try {
                var user = localStorage.getItem(USER_KEY);
                return user ? JSON.parse(user) : null;
            } catch (e) {
                return null;
            }
        },

        // Salva token e dados do usuário
        setAuth: function (token, user) {
            try {
                localStorage.setItem(TOKEN_KEY, token);
                localStorage.setItem(USER_KEY, JSON.stringify(user));
            } catch (e) {
                console.error('[Auth] Falha ao salvar autenticação:', e);
            }
        },

        // Remove autenticação (logout)
        clearAuth: function () {
            try {
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(USER_KEY);
            } catch (e) {
                console.error('[Auth] Falha ao limpar autenticação:', e);
            }
        },

        // Login com Google
         loginWithGoogle: function () {
             return NS.Api.post('auth/google/init')
                 .then(function (data) {
                     if (data && data.authUrl) {
                         // Abre janela OAuth (Cordova: InAppBrowser; Web: fallback para window.location)
                         var url = String(data.authUrl);
                         if (window.cordova && window.cordova.InAppBrowser && window.cordova.InAppBrowser.open) {
                             var ref = window.cordova.InAppBrowser.open(url, '_blank', 'location=yes,clearsessioncache=yes');

                             // Fechar automaticamente ao detectar callback
                             ref.addEventListener('loadstart', function (evt) {
                                 var u = '' + (evt && evt.url ? evt.url : '');
                                 if (u.indexOf('provider=google') >= 0 && u.indexOf('code=') >= 0) {
                                     try { ref.close(); } catch (e) {}
                                 }
                             });
                         } else {
                             window.location.href = url;
                         }
                     } else {
                        throw new Error('URL de autenticação não retornada.');
                    }
                });
        },

        // Login com GitHub
         loginWithGithub: function () {
             return NS.Api.post('auth/github/init')
                 .then(function (data) {
                     if (data && data.authUrl) {
                         // Abre janela OAuth (Cordova: InAppBrowser; Web: fallback para window.location)
                         var url = String(data.authUrl);
                         if (window.cordova && window.cordova.InAppBrowser && window.cordova.InAppBrowser.open) {
                             var ref = window.cordova.InAppBrowser.open(url, '_blank', 'location=yes,clearsessioncache=yes');

                             // Fechar automaticamente ao detectar callback
                             ref.addEventListener('loadstart', function (evt) {
                                 var u = '' + (evt && evt.url ? evt.url : '');
                                 if (u.indexOf('provider=github') >= 0 && u.indexOf('code=') >= 0) {
                                     try { ref.close(); } catch (e) {}
                                 }
                             });
                         } else {
                             window.location.href = url;
                         }
                     } else {
                        throw new Error('URL de autenticação não retornada.');
                    }
                });
        },

        // Enviar código SMS
        sendSMS: function (phoneNumber) {
            var phone = String(phoneNumber || '').trim();
            if (!phone) {
                return Promise.reject(new Error('Número de telefone inválido.'));
            }
            return NS.Api.post('auth/sms/send', { phone: phone });
        },

        // Verificar código SMS
        verifySMS: function (phoneNumber, code) {
            var phone = String(phoneNumber || '').trim();
            var smsCode = String(code || '').trim();
            if (!phone || !smsCode) {
                return Promise.reject(new Error('Número ou código inválido.'));
            }
            return NS.Api.post('auth/sms/verify', { phone: phone, code: smsCode })
                .then(function (data) {
                    if (data && data.token && data.user) {
                        this.setAuth(data.token, data.user);
                        return data;
                    } else {
                        throw new Error('Token ou dados do usuário não retornados.');
                    }
                }.bind(this));
        },

        // Callback OAuth (Google/GitHub)
        handleOAuthCallback: function (code, provider) {
            return NS.Api.post('auth/' + provider + '/callback', { code: code })
                .then(function (data) {
                    if (data && data.token && data.user) {
                        this.setAuth(data.token, data.user);
                        return data;
                    } else {
                        throw new Error('Token ou dados do usuário não retornados.');
                    }
                }.bind(this));
        },

        // Modo convidado (sem autenticação)
        guestMode: function () {
            var guestToken = 'guest_' + NS.Device.id();
            var guestUser = {
                id: NS.Device.id(),
                name: 'Convidado',
                email: null,
                avatar: null,
                provider: 'guest'
            };
            this.setAuth(guestToken, guestUser);
            return Promise.resolve({ token: guestToken, user: guestUser });
        },

        // Logout
        logout: function () {
            return NS.Api.post('auth/logout')
                .then(function () {
                    this.clearAuth();
                }.bind(this))
                .catch(function () {
                    // Mesmo com erro, limpa localmente
                    this.clearAuth();
                }.bind(this));
        }
    };
})(window);
