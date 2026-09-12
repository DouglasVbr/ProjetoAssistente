-- Phennellopy — schema MySQL (dbForge Studio / MySQL 5.7+)
-- Execute este arquivo no banco `phennellopy` ANTES de subir a API.

CREATE DATABASE IF NOT EXISTS phennellopy
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE phennellopy;

CREATE TABLE IF NOT EXISTS memorias (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  p_escrita VARCHAR(255) NOT NULL,
  p_falada VARCHAR(255) NOT NULL,
  r_escrita VARCHAR(255) DEFAULT NULL,
  r_falada VARCHAR(255) DEFAULT NULL,
  device_id VARCHAR(64) DEFAULT NULL,
  legacy_id INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_p_falada (p_falada),
  KEY idx_p_escrita (p_escrita),
  KEY idx_device (device_id),
  KEY idx_legacy (legacy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela para histórico de conversas (contexto do Gemini)
CREATE TABLE IF NOT EXISTS conversas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id VARCHAR(64) DEFAULT NULL,
  role ENUM('user', 'model') NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_device_created (device_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Auth
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) NOT NULL,
  provider VARCHAR(16) NOT NULL,
  email VARCHAR(255) DEFAULT NULL,
  name VARCHAR(255) DEFAULT NULL,
  avatar VARCHAR(1024) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_provider_email (provider, email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id VARCHAR(64) NOT NULL,
  provider VARCHAR(16) NOT NULL,
  oauth_state VARCHAR(64) DEFAULT NULL,
  user_id VARCHAR(128) DEFAULT NULL,
  token VARCHAR(128) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_device_provider (device_id, provider),
  KEY idx_provider_state (provider, oauth_state),
  KEY idx_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
