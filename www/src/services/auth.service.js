/**
 * Serviço de Autenticação
 * Google OAuth, GitHub OAuth e SMS (Número de Celular)
 */
(function (global) {
    var NS = global.Phennellopy = global.Phennellopy || {};

    var TOKEN_KEY = 'phennellopy_auth_token';
    var USER_KEY = 'phennellopy_user';
    var supabaseClient = null;

    function getSupabase() {
        if (supabaseClient) return supabaseClient;
        var config = global.__PHENNELLOPY_CONFIG__ || {};
        if (!global.supabase || !config.supabaseUrl || !config.supabaseKey) return null;
        supabaseClient = global.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        return supabaseClient;
    }

    function saveSupabaseSession(session) {
        if (!session) return null;
        var user = session.user || {};
        NS.Auth.setAuth(session.access_token, {
            id: user.id,
            name: user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name) || user.email || 'Usuário',
            email: user.email || null,
            avatar: user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.picture) || null,
            provider: user.app_metadata && user.app_metadata.provider || 'supabase'
        });
        return session;
    }

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
            return this.loginWithProvider('google');
        },

        loginWithGithub: function () {
            return this.loginWithProvider('github');
        },

        loginWithProvider: function (provider) {
            var client = getSupabase();
            if (!client) return Promise.reject(new Error('A autenticação ainda não foi configurada no servidor.'));
            return client.auth.signInWithOAuth({
                provider: provider,
                options: {
                    redirectTo: window.location.origin + window.location.pathname
                }
            }).then(function (result) {
                if (result.error) throw result.error;
                return result.data;
            });
        },

        // Enviar código SMS
        sendSMS: function (phoneNumber) {
            var client = getSupabase();
            var phone = String(phoneNumber || '').trim();
            if (!client || !/^\+[1-9]\d{7,14}$/.test(phone)) {
                return Promise.reject(new Error('Informe o celular no formato internacional, como +5511999999999.'));
            }
            return client.auth.signInWithOtp({ phone: phone }).then(function (result) {
                if (result.error) throw result.error;
                return result.data;
            });
        },

        // Verificar código SMS
        verifySMS: function (phoneNumber, code) {
            var client = getSupabase();
            var phone = String(phoneNumber || '').trim();
            var smsCode = String(code || '').trim();
            if (!client || !phone || !/^\d{4,8}$/.test(smsCode)) {
                return Promise.reject(new Error('Número ou código inválido.'));
            }
            return client.auth.verifyOtp({ phone: phone, token: smsCode, type: 'sms' }).then(function (result) {
                if (result.error) throw result.error;
                saveSupabaseSession(result.data.session);
                return result.data;
            });
        },

        // Recupera a sessão criada pelo callback OAuth do Supabase.
        handleOAuthCallback: function () {
            var client = getSupabase();
            if (!client) return Promise.reject(new Error('A autenticação ainda não foi configurada no servidor.'));
            return client.auth.getSession().then(function (result) {
                if (result.error) throw result.error;
                if (!result.data.session) throw new Error('Não foi possível concluir o login.');
                saveSupabaseSession(result.data.session);
                return result.data;
            });
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
