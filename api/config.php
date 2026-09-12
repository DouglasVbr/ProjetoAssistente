<?php
/**
 * Credenciais do servidor. Ajuste host/user/pass no dbForge / MySQL local.
 * Este arquivo NÃO deve ir para o app Cordova.
 */
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'phennellopy',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4',
    ],
    
    // OpenJarvis - Personal AI local (https://github.com/open-jarvis/OpenJarvis)
    // Deixe vazio para desabilitar, ou configure a URL do servidor OpenJarvis
    'openjarvis_url' => getenv('OPENJARVIS_URL') ?: '',  // Ex: 'http://localhost:8000'
    
    // Google Gemini - IA na nuvem (principal)
    'gemini_api_key' => 'AIzaSyAsCX_lbGd9aZ90rRuvt3vOxef-Ks5DbVc',
    'gemini_model' => 'gemini-1.5-flash',
    
    // Claude/Anthropic - IA na nuvem (fallback)

    // Auth OAuth (Google / GitHub)
    'allowed_redirect_uris' => array_filter(array_map('strval', (array) (getenv('ALLOWED_REDIRECT_URIS') ? explode(',', getenv('ALLOWED_REDIRECT_URIS')) : []))),

    'google_client_id' => getenv('GOOGLE_CLIENT_ID') ?: '',
    'google_client_secret' => getenv('GOOGLE_CLIENT_SECRET') ?: '',
    'google_redirect_uri' => getenv('GOOGLE_REDIRECT_URI') ?: '',
    'google_scopes' => getenv('GOOGLE_SCOPES') ?: 'email profile',

    'github_client_id' => getenv('GITHUB_CLIENT_ID') ?: '',
    'github_client_secret' => getenv('GITHUB_CLIENT_SECRET') ?: '',
    'github_redirect_uri' => getenv('GITHUB_REDIRECT_URI') ?: '',
    'github_scopes' => getenv('GITHUB_SCOPES') ?: 'read:user user:email',

    
    'anthropic_api_key' => getenv('ANTHROPIC_API_KEY') ?: '',
    'anthropic_model' => 'claude-opus-5',
    
    'cors_origin' => '*',
];
