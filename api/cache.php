<?php
/**
 * Cache Layer - Cache de respostas e dados
 * Reduz custo de LLM e melhora performance
 */

declare(strict_types=1);

class CacheManager
{
    private const DEFAULT_TTL = 3600; // 1 hora
    private const CACHE_PREFIX = 'phennellopy_';
    
    /**
     * Verificar se APCu está disponível
     */
    public static function isAvailable(): bool
    {
        return extension_loaded('apcu') && ini_get('apc.enabled');
    }
    
    /**
     * Gerar cache key a partir de prompt
     */
    public static function generatePromptCacheKey(string $prompt): string
    {
        // Hash do prompt para cache key concisa
        $hash = hash('sha256', trim(mb_strtolower($prompt)));
        return self::CACHE_PREFIX . 'prompt_' . substr($hash, 0, 32);
    }
    
    /**
     * Buscar resposta em cache
     */
    public static function getPromptCache(string $prompt): ?array
    {
        if (!self::isAvailable()) {
            return null;
        }
        
        $key = self::generatePromptCacheKey($prompt);
        $cached = apcu_fetch($key);
        
        if ($cached === false) {
            return null;
        }
        
        $data = json_decode($cached, true);
        Logger::logCache($key, true, 3600);
        return $data;
    }
    
    /**
     * Salvar resposta em cache
     */
    public static function setPromptCache(string $prompt, array $response, int $ttl = self::DEFAULT_TTL): void
    {
        if (!self::isAvailable()) {
            return;
        }
        
        $key = self::generatePromptCacheKey($prompt);
        $cached = json_encode($response, JSON_UNESCAPED_UNICODE);
        
        apcu_store($key, $cached, $ttl);
        Logger::logCache($key, false, $ttl);
    }
    
    /**
     * Limpar cache de conversa de um device
     */
    public static function clearDeviceCache(string $deviceId): void
    {
        if (!self::isAvailable()) {
            return;
        }
        
        // Buscar todas as chaves com este device_id
        $iterator = new APCUIterator('/' . self::CACHE_PREFIX . '.*' . preg_quote($deviceId) . '.*/', APC_ITER_KEY);
        
        foreach ($iterator as $entry) {
            apcu_delete($entry['key']);
        }
    }
    
    /**
     * Gerar cache key genérico
     */
    public static function makeKey(string $prefix, ...$parts): string
    {
        $key = implode('_', array_map('strval', $parts));
        return self::CACHE_PREFIX . $prefix . '_' . hash('md5', $key);
    }
    
    /**
     * Get/Set com fallback
     */
    public static function remember(string $key, int $ttl, callable $callback)
    {
        if (!self::isAvailable()) {
            return $callback();
        }
        
        $cached = apcu_fetch($key);
        if ($cached !== false) {
            return json_decode($cached, true);
        }
        
        $result = $callback();
        apcu_store($key, json_encode($result, JSON_UNESCAPED_UNICODE), $ttl);
        return $result;
    }
}
