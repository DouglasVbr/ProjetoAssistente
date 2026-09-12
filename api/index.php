<?php
/**
 * Phennellopy REST API — PHP + MySQL
 * Credenciais do banco ficam SOMENTE neste servidor.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Device-Id, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    json_error(500, 'Arquivo api/config.php não encontrado. Copie config.example.php.');
}
$config = require $configPath;

function json_ok($data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(int $code, string $message): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function body_json(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function db(array $config): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $db = $config['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $db['host'],
        (int) $db['port'],
        $db['name'],
        $db['charset']
    );
    try {
        $pdo = new PDO($dsn, $db['user'], $db['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        json_error(500, 'Falha ao conectar no MySQL.');
    }
    return $pdo;
}

function sanitize_str($value, int $max = 255): string
{
    $text = trim((string) $value);
    if (function_exists('mb_substr')) {
        $text = mb_substr($text, 0, $max);
    } else {
        $text = substr($text, 0, $max);
    }
    return $text;
}

function device_id(): string
{
    return sanitize_str($_SERVER['HTTP_X_DEVICE_ID'] ?? '', 64);
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($scriptDir && strpos($path, $scriptDir) === 0) {
    $path = substr($path, strlen($scriptDir)) ?: '/';
}
$path = '/' . ltrim($path, '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// DEBUG TEMPORÁRIO - REMOVER DEPOIS
if ($path === '/gemini' || $path === '/debug-route') {
    error_log("DEBUG Phennellopy - Method: $method, Path: $path");
}

try {
    $pdo = db($config);

    if ($method === 'GET' && ($path === '/' || $path === '/health')) {
        json_ok(['status' => 'ok', 'service' => 'phennellopy-api']);
    }

    if ($method === 'GET' && $path === '/memorias') {
        $q = sanitize_str($_GET['q'] ?? '', 255);
        $device = device_id();
        $sql = 'SELECT id, p_escrita, p_falada, r_escrita, r_falada, created_at, updated_at
                FROM memorias';
        $params = [];
        $where = [];
        if ($device !== '') {
            $where[] = '(device_id = :device OR device_id IS NULL)';
            $params[':device'] = $device;
        }
        if ($q !== '') {
            $where[] = '(p_escrita LIKE :q OR p_falada LIKE :q OR r_escrita LIKE :q OR r_falada LIKE :q)';
            $params[':q'] = '%' . $q . '%';
        }
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY id ASC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        json_ok($stmt->fetchAll());
    }

    if ($method === 'GET' && preg_match('#^/memorias/(\d+)$#', $path, $m)) {
        $stmt = $pdo->prepare('SELECT id, p_escrita, p_falada, r_escrita, r_falada, created_at, updated_at FROM memorias WHERE id = :id');
        $stmt->execute([':id' => (int) $m[1]]);
        $row = $stmt->fetch();
        if (!$row) {
            json_error(404, 'Memória não encontrada.');
        }
        json_ok($row);
    }

    if ($method === 'POST' && $path === '/memorias') {
        $body = body_json();
        $pEscrita = sanitize_str($body['p_escrita'] ?? '');
        $pFalada = sanitize_str($body['p_falada'] ?? '');
        if ($pEscrita === '' || $pFalada === '') {
            json_error(400, 'p_escrita e p_falada são obrigatórios.');
        }
        $stmt = $pdo->prepare(
            'INSERT INTO memorias (p_escrita, p_falada, r_escrita, r_falada, device_id, legacy_id)
             VALUES (:p_escrita, :p_falada, :r_escrita, :r_falada, :device_id, :legacy_id)'
        );
        $stmt->execute([
            ':p_escrita' => $pEscrita,
            ':p_falada' => $pFalada,
            ':r_escrita' => sanitize_str($body['r_escrita'] ?? '') ?: null,
            ':r_falada' => sanitize_str($body['r_falada'] ?? '') ?: null,
            ':device_id' => device_id() ?: null,
            ':legacy_id' => isset($body['legacy_id']) ? (int) $body['legacy_id'] : null,
        ]);
        $id = (int) $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT id, p_escrita, p_falada, r_escrita, r_falada, created_at, updated_at FROM memorias WHERE id = :id');
        $stmt->execute([':id' => $id]);
        json_ok($stmt->fetch(), 201);
    }

    // ========== ENDPOINT: Auth OAuth ==========
    if ($method === 'POST' && $path === '/auth/google/init') {
        $body = body_json();
        $device = device_id();
        $redirectUri = (string) ($body['redirect_uri'] ?? '');
        if ($redirectUri === '') {
            $redirectUri = (string) ($config['google_redirect_uri'] ?? '');
        }
        $clientId = (string) ($config['google_client_id'] ?? '');
        $clientSecret = (string) ($config['google_client_secret'] ?? '');
        $scopes = (string) ($body['scopes'] ?? ($config['google_scopes'] ?? 'email profile'));
        if ($clientId === '' || $redirectUri === '') {
            json_error(503, 'Google OAuth não configurado no servidor (google_client_id/google_redirect_uri).');
        }

        if (!in_array($redirectUri, array_map('strval', (array) ($config['allowed_redirect_uris'] ?? [])), true)) {
            json_error(400, 'redirect_uri inválido.');
        }

        $state = bin2hex(random_bytes(16));
        if ($device !== '') {
            $stmt = $pdo->prepare('INSERT INTO sessions (device_id, provider, oauth_state, created_at, updated_at) VALUES (:device, :provider, :oauth_state, NOW(), NOW()) ON DUPLICATE KEY UPDATE oauth_state = VALUES(oauth_state), updated_at = NOW()');
            $stmt->execute([':device' => $device, ':provider' => 'google', ':oauth_state' => $state]);
        }

        $params = [
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => $scopes,
            'access_type' => 'offline',
            'prompt' => 'consent',
            'state' => $state,
        ];
        if (!empty($body['login_hint'])) {
            $params['login_hint'] = sanitize_str($body['login_hint'], 128);
        }

        $url = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);
        json_ok(['authUrl' => $url, 'provider' => 'google']);
    }

    if ($method === 'POST' && $path === '/auth/google/callback') {
        $body = body_json();
        $code = sanitize_str($body['code'] ?? '', 2048);
        $provider = 'google';
        if ($code === '') {
            json_error(400, 'code é obrigatório.');
        }

        $clientId = (string) ($config['google_client_id'] ?? '');
        $clientSecret = (string) ($config['google_client_secret'] ?? '');
        $redirectUri = (string) ($config['google_redirect_uri'] ?? '');
        if ($clientId === '' || $clientSecret === '' || $redirectUri === '') {
            json_error(503, 'Google OAuth não configurado no servidor (google_client_id/google_client_secret/google_redirect_uri).');
        }

        $device = device_id();
        $expectedState = '';
        if (!empty($body['state']) && $device !== '') {
            $expectedState = sanitize_str($body['state'], 128);
        } elseif ($device !== '') {
            $stmt = $pdo->prepare('SELECT oauth_state FROM sessions WHERE device_id = :device AND provider = :provider ORDER BY id DESC LIMIT 1');
            $stmt->execute([':device' => $device, ':provider' => $provider]);
            $expectedState = (string) ($stmt->fetchColumn() ?: '');
        }

        if (!empty($body['state']) && $expectedState !== '' && !hash_equals($expectedState, (string) sanitize_str($body['state'], 128))) {
            json_error(400, 'state inválido.');
        }

        $tokenUrl = 'https://oauth2.googleapis.com/token';
        $postFields = [
            'code' => $code,
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
        ];

        $ch = curl_init($tokenUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_POSTFIELDS => http_build_query($postFields),
            CURLOPT_TIMEOUT => 30,
        ]);
        $raw = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            json_error(502, 'Falha ao obter token do Google: ' . $curlErr);
        }
        $decoded = json_decode((string) $raw, true);
        if ($http >= 400) {
            json_error(502, 'Erro do Google no token endpoint.');
        }

        $accessToken = (string) ($decoded['access_token'] ?? '');
        if ($accessToken === '') {
            json_error(502, 'Google não retornou access_token.');
        }

        $userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
        $ch = curl_init($userInfoUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken],
            CURLOPT_TIMEOUT => 20,
        ]);
        $raw2 = curl_exec($ch);
        $http2 = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr2 = curl_error($ch);
        curl_close($ch);
        if ($raw2 === false) {
            json_error(502, 'Falha ao obter userinfo do Google: ' . $curlErr2);
        }
        $decoded2 = json_decode((string) $raw2, true);
        if ($http2 >= 400) {
            json_error(502, 'Erro do Google no userinfo endpoint.');
        }

        $email = sanitize_str($decoded2['email'] ?? '', 255);
        $name = sanitize_str($decoded2['name'] ?? '', 255);
        $avatar = sanitize_str($decoded2['picture'] ?? '', 1024);
        if ($email === '' && !empty($decoded2['id'])) {
            $email = sanitize_str($decoded2['id'], 255) . '@google-oauth';
        }

        $token = bin2hex(random_bytes(32));
        $user = [
            'id' => 'google_' . sanitize_str((string) ($decoded2['id'] ?? ''), 128),
            'name' => $name,
            'email' => $email !== '' ? $email : null,
            'avatar' => $avatar !== '' ? $avatar : null,
            'provider' => 'google',
        ];

        if ($device !== '') {
            $stmt = $pdo->prepare('INSERT INTO users (id, provider, email, name, avatar, created_at, updated_at) VALUES (:id, :provider, :email, :name, :avatar, NOW(), NOW()) ON DUPLICATE KEY UPDATE name = VALUES(name), avatar = VALUES(avatar), updated_at = NOW()');
            $stmt->execute([':id' => (string) $user['id'], ':provider' => 'google', ':email' => $user['email'], ':name' => $user['name'], ':avatar' => $user['avatar']]);

            $stmt = $pdo->prepare('INSERT INTO sessions (device_id, provider, oauth_state, user_id, token, created_at, updated_at) VALUES (:device, :provider, :oauth_state, :user_id, :token, NOW(), NOW()) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), token = VALUES(token), updated_at = NOW()');
            $stmt->execute([':device' => $device, ':provider' => 'google', ':oauth_state' => $expectedState, ':user_id' => $user['id'], ':token' => $token]);
        }

        json_ok(['token' => $token, 'user' => $user]);
    }

    if ($method === 'POST' && $path === '/auth/github/init') {
        $body = body_json();
        $device = device_id();
        $redirectUri = (string) ($body['redirect_uri'] ?? '');
        if ($redirectUri === '') {
            $redirectUri = (string) ($config['github_redirect_uri'] ?? '');
        }
        $clientId = (string) ($config['github_client_id'] ?? '');
        if ($clientId === '' || $redirectUri === '') {
            json_error(503, 'GitHub OAuth não configurado no servidor (github_client_id/github_redirect_uri).');
        }
        if (!in_array($redirectUri, array_map('strval', (array) ($config['allowed_redirect_uris'] ?? [])), true)) {
            json_error(400, 'redirect_uri inválido.');
        }

        $state = bin2hex(random_bytes(16));
        if ($device !== '') {
            $stmt = $pdo->prepare('INSERT INTO sessions (device_id, provider, oauth_state, created_at, updated_at) VALUES (:device, :provider, :oauth_state, NOW(), NOW()) ON DUPLICATE KEY UPDATE oauth_state = VALUES(oauth_state), updated_at = NOW()');
            $stmt->execute([':device' => $device, ':provider' => 'github', ':oauth_state' => $state]);
        }

        $scopes = (string) ($body['scopes'] ?? ($config['github_scopes'] ?? 'read:user user:email'));

        $url = 'https://github.com/login/oauth/authorize?' . http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'scope' => $scopes,
            'state' => $state,
            'allow_signup' => 'true',
        ]);

        json_ok(['authUrl' => $url, 'provider' => 'github']);
    }

    if ($method === 'POST' && $path === '/auth/github/callback') {
        $body = body_json();
        $code = sanitize_str($body['code'] ?? '', 2048);
        $provider = 'github';
        if ($code === '') {
            json_error(400, 'code é obrigatório.');
        }

        $clientId = (string) ($config['github_client_id'] ?? '');
        $clientSecret = (string) ($config['github_client_secret'] ?? '');
        $redirectUri = (string) ($config['github_redirect_uri'] ?? '');
        if ($clientId === '' || $clientSecret === '' || $redirectUri === '') {
            json_error(503, 'GitHub OAuth não configurado no servidor (github_client_id/github_client_secret/github_redirect_uri).');
        }

        $device = device_id();
        $expectedState = '';
        if (!empty($body['state']) && $device !== '') {
            $expectedState = sanitize_str($body['state'], 128);
        } elseif ($device !== '') {
            $stmt = $pdo->prepare('SELECT oauth_state FROM sessions WHERE device_id = :device AND provider = :provider ORDER BY id DESC LIMIT 1');
            $stmt->execute([':device' => $device, ':provider' => $provider]);
            $expectedState = (string) ($stmt->fetchColumn() ?: '');
        }

        if (!empty($body['state']) && $expectedState !== '' && !hash_equals($expectedState, (string) sanitize_str($body['state'], 128))) {
            json_error(400, 'state inválido.');
        }

        $tokenUrl = 'https://github.com/login/oauth/access_token';
        $postFields = [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'code' => $code,
            'redirect_uri' => $redirectUri,
        ];

        $ch = curl_init($tokenUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_POSTFIELDS => http_build_query($postFields),
            CURLOPT_TIMEOUT => 30,
        ]);
        $raw = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            json_error(502, 'Falha ao obter token do GitHub: ' . $curlErr);
        }
        $decoded = json_decode((string) $raw, true);
        if (!is_array($decoded)) {
            parse_str((string) $raw, $decoded);
        }
        if ($http >= 400 || empty($decoded['access_token'])) {
            json_error(502, 'Erro do GitHub no token endpoint.');
        }

        $accessToken = (string) $decoded['access_token'];

        $headers = ['Authorization: Bearer ' . $accessToken, 'User-Agent: phennellopy'];
        $ch = curl_init('https://api.github.com/user');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 20,
        ]);
        $raw2 = curl_exec($ch);
        $http2 = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr2 = curl_error($ch);
        curl_close($ch);
        if ($raw2 === false) {
            json_error(502, 'Falha ao obter user do GitHub: ' . $curlErr2);
        }
        $decoded2 = json_decode((string) $raw2, true);
        if ($http2 >= 400) {
            json_error(502, 'Erro do GitHub no user endpoint.');
        }

        $userId = sanitize_str((string) ($decoded2['id'] ?? ''), 128);
        $name = sanitize_str((string) ($decoded2['name'] ?? '') ?: (string) ($decoded2['login'] ?? ''), 255);
        $avatar = sanitize_str((string) ($decoded2['avatar_url'] ?? ''), 1024);

        $email = '';
        $ch = curl_init('https://api.github.com/user/emails');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 20,
        ]);
        $raw3 = curl_exec($ch);
        $http3 = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr3 = curl_error($ch);
        curl_close($ch);
        if ($raw3 !== false && $http3 < 400) {
            $emails = json_decode((string) $raw3, true);
            if (is_array($emails)) {
                foreach ($emails as $e) {
                    if (($e['primary'] ?? false) === true && !empty($e['email'])) {
                        $email = sanitize_str((string) $e['email'], 255);
                        break;
                    }
                }
            }
        }

        if ($email === '' && $userId !== '') {
            $email = $userId . '@github-oauth';
        }

        $token = bin2hex(random_bytes(32));
        $user = [
            'id' => 'github_' . $userId,
            'name' => $name,
            'email' => $email !== '' ? $email : null,
            'avatar' => $avatar !== '' ? $avatar : null,
            'provider' => 'github',
        ];

        if ($device !== '') {
            $stmt = $pdo->prepare('INSERT INTO users (id, provider, email, name, avatar, created_at, updated_at) VALUES (:id, :provider, :email, :name, :avatar, NOW(), NOW()) ON DUPLICATE KEY UPDATE name = VALUES(name), avatar = VALUES(avatar), updated_at = NOW()');
            $stmt->execute([':id' => (string) $user['id'], ':provider' => 'github', ':email' => $user['email'], ':name' => $user['name'], ':avatar' => $user['avatar']]);

            $stmt = $pdo->prepare('INSERT INTO sessions (device_id, provider, oauth_state, user_id, token, created_at, updated_at) VALUES (:device, :provider, :oauth_state, :user_id, :token, NOW(), NOW()) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), token = VALUES(token), updated_at = NOW()');
            $stmt->execute([':device' => $device, ':provider' => 'github', ':oauth_state' => $expectedState, ':user_id' => $user['id'], ':token' => $token]);
        }

        json_ok(['token' => $token, 'user' => $user]);
    }

    if ($method === 'POST' && $path === '/memorias/lote') {
        $body = body_json();
        $items = $body['items'] ?? [];
        if (!is_array($items) || !$items) {
            json_error(400, 'Envie items[] com as memórias legadas.');
        }
        $pdo->beginTransaction();
        $inserted = [];
        $stmt = $pdo->prepare(
            'INSERT INTO memorias (p_escrita, p_falada, r_escrita, r_falada, device_id, legacy_id)
             VALUES (:p_escrita, :p_falada, :r_escrita, :r_falada, :device_id, :legacy_id)'
        );
        foreach ($items as $item) {
            $pEscrita = sanitize_str($item['p_escrita'] ?? '');
            $pFalada = sanitize_str($item['p_falada'] ?? '');
            if ($pEscrita === '' || $pFalada === '') {
                continue;
            }
            $stmt->execute([
                ':p_escrita' => $pEscrita,
                ':p_falada' => $pFalada,
                ':r_escrita' => sanitize_str($item['r_escrita'] ?? '') ?: null,
                ':r_falada' => sanitize_str($item['r_falada'] ?? '') ?: null,
                ':device_id' => device_id() ?: null,
                ':legacy_id' => isset($item['id']) ? (int) $item['id'] : null,
            ]);
            $inserted[] = (int) $pdo->lastInsertId();
        }
        $pdo->commit();
        json_ok(['imported' => count($inserted), 'ids' => $inserted], 201);
    }

    if ($method === 'PUT' && preg_match('#^/memorias/(\d+)$#', $path, $m)) {
        $id = (int) $m[1];
        $body = body_json();
        $fields = [];
        $params = [':id' => $id];
        foreach (['p_escrita', 'p_falada', 'r_escrita', 'r_falada'] as $col) {
            if (array_key_exists($col, $body)) {
                $fields[] = "$col = :$col";
                $val = sanitize_str($body[$col] ?? '');
                $params[":$col"] = $val === '' ? null : $val;
            }
        }
        if (!$fields) {
            json_error(400, 'Nenhum campo para atualizar.');
        }
        $sql = 'UPDATE memorias SET ' . implode(', ', $fields) . ' WHERE id = :id';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        if ($stmt->rowCount() === 0) {
            $check = $pdo->prepare('SELECT id FROM memorias WHERE id = :id');
            $check->execute([':id' => $id]);
            if (!$check->fetch()) {
                json_error(404, 'Memória não encontrada.');
            }
        }
        $stmt = $pdo->prepare('SELECT id, p_escrita, p_falada, r_escrita, r_falada, created_at, updated_at FROM memorias WHERE id = :id');
        $stmt->execute([':id' => $id]);
        json_ok($stmt->fetch());
    }

    if ($method === 'DELETE' && $path === '/memorias') {
        $device = device_id();
        if ($device !== '') {
            $stmt = $pdo->prepare('DELETE FROM memorias WHERE device_id = :device OR device_id IS NULL');
            $stmt->execute([':device' => $device]);
        } else {
            $pdo->exec('DELETE FROM memorias');
        }
        json_ok(['deleted' => true]);
    }

    if ($method === 'DELETE' && preg_match('#^/memorias/(\d+)$#', $path, $m)) {
        $stmt = $pdo->prepare('DELETE FROM memorias WHERE id = :id');
        $stmt->execute([':id' => (int) $m[1]]);
        json_ok(['deleted' => $stmt->rowCount() > 0]);
    }

    // ========== ENDPOINT: OpenJarvis Proxy ==========
    if ($method === 'POST' && $path === '/jarvis') {
        $jarvisUrl = (string) ($config['openjarvis_url'] ?? '');
        if ($jarvisUrl === '') {
            json_error(503, 'OpenJarvis não configurado no servidor (openjarvis_url).');
        }

        $body = body_json();
        $message = sanitize_str($body['message'] ?? '', 4000);
        if ($message === '') {
            json_error(400, 'message é obrigatório.');
        }

        $agent = sanitize_str($body['agent'] ?? 'orchestrator', 64);
        $systemPrompt = (string) ($body['system_prompt'] ?? 'Você é Phennellopy, assistente de voz em português do Brasil. Responda de forma curta, clara e falável.');
        $maxTokens = isset($body['max_tokens']) ? (int) $body['max_tokens'] : 500;
        $temperature = isset($body['temperature']) ? (float) $body['temperature'] : 0.7;

        $payload = json_encode([
            'message' => $message,
            'agent' => $agent,
            'system_prompt' => $systemPrompt,
            'max_tokens' => $maxTokens,
            'temperature' => $temperature,
        ], JSON_UNESCAPED_UNICODE);

        $ch = curl_init(rtrim($jarvisUrl, '/') . '/api/chat');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_TIMEOUT => 60,
        ]);

        $raw = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            json_error(502, 'Falha ao conectar com OpenJarvis: ' . $curlErr);
        }

        $decoded = json_decode($raw, true);
        if ($http >= 400) {
            $msg = is_array($decoded) ? ($decoded['error'] ?? 'Erro do OpenJarvis') : 'Erro do OpenJarvis';
            json_error(502, $msg);
        }

        // OpenJarvis pode retornar diferentes formatos
        $text = '';
        if (isset($decoded['response'])) {
            $text = (string) $decoded['response'];
        } elseif (isset($decoded['message'])) {
            $text = (string) $decoded['message'];
        } elseif (isset($decoded['text'])) {
            $text = (string) $decoded['text'];
        } elseif (is_string($decoded)) {
            $text = $decoded;
        }

        json_ok(['text' => trim($text), 'source' => 'openjarvis', 'agent' => $agent]);
    }

    // ========== ENDPOINT: Google Gemini (com contexto) ==========
    if ($method === 'POST' && $path === '/gemini') {
        $key = (string) ($config['gemini_api_key'] ?? '');
        if ($key === '') {
            json_error(503, 'API do Gemini não configurada no servidor (gemini_api_key).');
        }
        
        $body = body_json();
        $prompt = sanitize_str($body['prompt'] ?? '', 4000);
        if ($prompt === '') {
            json_error(400, 'prompt é obrigatório.');
        }
        
        $device = device_id();
        $maxHistory = 10; // Últimas 10 mensagens para contexto
        
        // System prompt (personalidade da Phennellopy)
        $systemPrompt = 'Você é Phennellopy, uma assistente de voz inteligente em português do Brasil. ' .
                        'Responda de forma curta, clara e natural, ideal para ser lida em voz alta. ' .
                        'Seja amigável, prestativa e direta. ' .
                        'Evite formatações especiais, markdown ou caracteres que não sejam falados naturalmente. ' .
                        'Nunca peça senhas, dados bancários ou informações sensíveis. ' .
                        'Se não souber algo, admita honestamente.';
        
        // Buscar histórico de conversa do dispositivo
        $history = [];
        if ($device !== '') {
            $stmt = $pdo->prepare(
                'SELECT role, message FROM conversas 
                 WHERE device_id = :device 
                 ORDER BY id DESC 
                 LIMIT :limit'
            );
            $stmt->bindValue(':device', $device, PDO::PARAM_STR);
            $stmt->bindValue(':limit', $maxHistory, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll();
            // Reverter ordem (mais antiga primeiro)
            $history = array_reverse($rows);
        }
        
        // Construir array de conteúdo para o Gemini
        $contents = [];
        
        // Adicionar histórico
        foreach ($history as $msg) {
            $contents[] = [
                'role' => $msg['role'] === 'user' ? 'user' : 'model',
                'parts' => [['text' => $msg['message']]]
            ];
        }
        
        // Adicionar mensagem atual do usuário
        $contents[] = [
            'role' => 'user',
            'parts' => [['text' => $prompt]]
        ];
        
        // Montar payload para API do Gemini
        $model = $config['gemini_model'] ?? 'gemini-1.5-flash';
        $payload = json_encode([
            'contents' => $contents,
            'systemInstruction' => [
                'parts' => [['text' => $systemPrompt]]
            ],
            'generationConfig' => [
                'temperature' => 0.7,
                'maxOutputTokens' => 500,
                'topP' => 0.95,
            ],
            'safetySettings' => [
                ['category' => 'HARM_CATEGORY_HARASSMENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                ['category' => 'HARM_CATEGORY_HATE_SPEECH', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                ['category' => 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                ['category' => 'HARM_CATEGORY_DANGEROUS_CONTENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
            ]
        ], JSON_UNESCAPED_UNICODE);
        
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . $model . ':generateContent?key=' . $key;
        
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_TIMEOUT => 45,
        ]);
        
        $raw = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);
        
        if ($raw === false) {
            json_error(502, 'Falha ao conectar com o Gemini: ' . $curlErr);
        }
        
        $decoded = json_decode($raw, true);
        if ($http >= 400) {
            $msg = 'Erro do Gemini';
            if (is_array($decoded) && isset($decoded['error']['message'])) {
                $msg = $decoded['error']['message'];
            }
            json_error(502, $msg);
        }
        
        // Extrair resposta do Gemini
        $text = '';
        if (isset($decoded['candidates'][0]['content']['parts'][0]['text'])) {
            $text = trim($decoded['candidates'][0]['content']['parts'][0]['text']);
        }
        
        if ($text === '') {
            json_error(502, 'Gemini não retornou resposta válida.');
        }
        
        // Salvar a conversa no banco de dados
        if ($device !== '') {
            $stmt = $pdo->prepare(
                'INSERT INTO conversas (device_id, role, message) VALUES (:device, :role, :message)'
            );
            
            // Salvar pergunta do usuário
            $stmt->execute([
                ':device' => $device,
                ':role' => 'user',
                ':message' => $prompt
            ]);
            
            // Salvar resposta do modelo
            $stmt->execute([
                ':device' => $device,
                ':role' => 'model',
                ':message' => $text
            ]);
        }
        
        json_ok(['text' => $text, 'source' => 'gemini']);
    }

    // ========== ENDPOINT: Limpar histórico de conversa ==========
    if ($method === 'DELETE' && $path === '/conversas') {
        $device = device_id();
        if ($device !== '') {
            $stmt = $pdo->prepare('DELETE FROM conversas WHERE device_id = :device');
            $stmt->execute([':device' => $device]);
            json_ok(['deleted' => true, 'message' => 'Histórico de conversa limpo']);
        } else {
            json_error(400, 'Device ID não fornecido');
        }
    }

    // ========== ENDPOINT: Claude/Anthropic LLM (fallback) ==========
    if ($method === 'POST' && $path === '/llm') {
        $key = (string) ($config['anthropic_api_key'] ?? '');
        if ($key === '') {
            json_error(503, 'API de IA não configurada no servidor (anthropic_api_key).');
        }
        $body = body_json();
        $prompt = sanitize_str($body['prompt'] ?? '', 4000);
        if ($prompt === '') {
            json_error(400, 'prompt é obrigatório.');
        }
        $system = (string) ($body['system'] ?? 'Você é Phennellopy, assistente de voz em português do Brasil. Responda de forma curta, clara e falável. Nunca peça nem repita dados sensíveis.');
        $payload = json_encode([
            'model' => $config['anthropic_model'] ?? 'claude-opus-5',
            'max_tokens' => 1024,
            'system' => $system,
            'messages' => [
                ['role' => 'user', 'content' => $prompt],
            ],
        ], JSON_UNESCAPED_UNICODE);

        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'x-api-key: ' . $key,
                'anthropic-version: 2023-06-01',
            ],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_TIMEOUT => 45,
        ]);
        $raw = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            json_error(502, 'Falha ao falar com a IA: ' . $curlErr);
        }
        $decoded = json_decode($raw, true);
        if ($http >= 400) {
            $msg = is_array($decoded) ? ($decoded['error']['message'] ?? 'Erro da IA') : 'Erro da IA';
            json_error(502, $msg);
        }
        $text = '';
        if (isset($decoded['content']) && is_array($decoded['content'])) {
            foreach ($decoded['content'] as $block) {
                if (($block['type'] ?? '') === 'text') {
                    $text .= (string) ($block['text'] ?? '');
                }
            }
        }
        json_ok(['text' => trim($text), 'source' => 'claude']);
    }

    json_error(404, 'Rota não encontrada: ' . $method . ' ' . $path);
} catch (Throwable $e) {
    json_error(500, 'Erro interno da API.');
}
