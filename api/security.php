<?php
/**
 * Security - Rate limiting, CORS, JWT validation
 * Proteção contra abuso e integração segura
 */

declare(strict_types=1);

class SecurityManager
{
    private const RATE_LIMIT_REQUESTS = 100;
    private const RATE_LIMIT_WINDOW = 3600; // 1 hora
    private const RATE_LIMIT_KEY = 'rate_limit_';
    
    /**
     * Validar rate limit por device_id
     */
    public static function checkRateLimit(string $deviceId): bool
    {
        if (empty($deviceId)) {
            return true; // Sem device_id, pular rate limit (fallback)
        }
        
        $key = self::RATE_LIMIT_KEY . $deviceId;
        $current = apcu_fetch($key);
        
        if ($current === false) {
            apcu_store($key, 1, self::RATE_LIMIT_WINDOW);
            return true;
        }
        
        if ($current >= self::RATE_LIMIT_REQUESTS) {
            return false; // Limite excedido
        }
        
        apcu_inc($key);
        return true;
    }
    
    /**
     * Configurar CORS restritivo
     */
    public static function setupCors(string $allowedOrigin = '*'): void
    {
        // Em produção, usar whitelist de origins
        $allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:8000',
            'http://10.0.2.2:3000', // Android emulator
            'https://seu-dominio.com',
            'https://app.seu-dominio.com'
        ];
        
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        
        // Permitir CORS apenas de origins confiáveis
        if ($allowedOrigin === '*' || in_array($origin, $allowedOrigins, true)) {
            header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
        }
        
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-Device-Id, Authorization, X-API-Key');
        header('Access-Control-Max-Age: 86400');
        header('Access-Control-Allow-Credentials: true');
    }
    
    /**
     * Validar JWT token
     */
    public static function validateJWT(string $token, string $secret): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        
        [$header, $payload, $signature] = $parts;
        
        // Verificar assinatura
        $expectedSignature = base64_encode(
            hash_hmac('sha256', "{$header}.{$payload}", $secret, true)
        );
        
        if (!hash_equals($signature, $expectedSignature)) {
            return null;
        }
        
        // Decodificar payload
        $decoded = json_decode(base64_decode($payload, true), true);
        
        if (!is_array($decoded)) {
            return null;
        }
        
        // Verificar expiração
        if (isset($decoded['exp']) && $decoded['exp'] < time()) {
            return null;
        }
        
        return $decoded;
    }
    
    /**
     * Gerar JWT token
     */
    public static function generateJWT(array $payload, string $secret, int $expiresIn = 86400): string
    {
        $payload['iat'] = time();
        $payload['exp'] = time() + $expiresIn;
        
        $header = base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload_encoded = base64_encode(json_encode($payload, JSON_UNESCAPED_UNICODE));
        
        $signature = base64_encode(
            hash_hmac('sha256', "{$header}.{$payload_encoded}", $secret, true)
        );
        
        return "{$header}.{$payload_encoded}.{$signature}";
    }
    
    /**
     * Extrair token do header Authorization
     */
    public static function getBearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        
        if (preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            return $matches[1];
        }
        
        return null;
    }
}

// Aplicar CORS em todas as respostas
SecurityManager::setupCors();
