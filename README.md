# ProjetoAssistente (Phennellopy)

## Visão geral
O **ProjetoAssistente** é um app híbrido (Cordova) de assistente de voz em **Português do Brasil**, com:

- **Reconhecimento de voz** (áudio → texto)
- **Text-to-Speech (TTS)** (texto → voz)
- **Comandos locais** (ex.: navegar para “Memórias”, limpar tela)
- **Inteligência via LLM** no backend (atualmente com **Google Gemini**)
- **Memórias** persistidas em MySQL
- **Login** via **Google OAuth** (backend PHP gera URL e troca `code` por token)

A UI conversa com um **backend PHP REST** que acessa **MySQL**.

---

## O que o projeto faz
### Fluxo de voz (alto nível)
1. Usuário toca em **Falar**.
2. O app captura a voz e converte para texto.
3. O texto é enviado ao backend via endpoint de IA (Gemini).
4. A resposta do Gemini volta para o app.
5. O app exibe e fala a resposta em voz alta (TTS).

### Memórias
- A API possui endpoints para cadastrar/consultar/limpar **memórias legadas**.
- Essas memórias estão no banco MySQL e podem ser usadas pelo app (conforme lógica do seu frontend).

### Contexto de conversa (Gemini)
- O backend mantém **histórico por device_id** na tabela `conversas`.
- A cada nova pergunta, as últimas mensagens são enviadas para o Gemini para manter coerência no diálogo.

---

## Tecnologias utilizadas
### Frontend (app)
- **Cordova** (Android e Browser)
- **Framework7** (UI)
- **JavaScript** (lógica do app)
- **jQuery** (utilizado nos handlers)
- **Web APIs** do Cordova/plugins:
  - `cordova-plugin-speechrecognition` (reconhecimento de voz)
  - `cordova-plugin-texttospeech` (voz)
  - `cordova-plugin-inappbrowser` (abrir OAuth externamente)

Arquivos/áreas principais:
- `www/index.html` (UI principal)
- `www/js/index.js` (processa comandos e fallback de IA)
- `www/src/services/*` (serviços de API, auth, Gemini)

### Backend (API)
- **PHP 8+**
- **MySQL** via **PDO**
- Endpoints REST em `api/index.php`

### Banco de dados
- Schema em `api/schema.sql`
  - `memorias`
  - `conversas`
  - `users`
  - `sessions`

---

## Endpoints da API (backend PHP)
> Base: normalmente `http://SEU_HOST/ProjetoAssistente/api/`

### Health
- `GET /health`
  - retorna status do serviço

### Memórias
- `GET /memorias`
- `GET /memorias/{id}`
- `POST /memorias`
- `POST /memorias/lote`
- `PUT /memorias/{id}`
- `DELETE /memorias`
- `DELETE /memorias/{id}`

### Gemini (IA com contexto)
- `POST /gemini`
  - body: `{ "prompt": "..." }`
  - retorna: `{ ok, data: { text, source } }`
- `DELETE /conversas`
  - limpa histórico por `device_id`

### Login Google (OAuth via backend)
- `POST /auth/google/init`
  - body: opcional `{ redirect_uri?, scopes? }`
  - retorna: `{ ok, data: { authUrl } }`
- `POST /auth/google/callback`
  - body: `{ code, state? }`
  - retorna: `{ ok, data: { token, user } }`

---

## Como configurar
### 1) MySQL
- Crie/execute o schema em `api/schema.sql` no banco **phennellopy**.

### 2) Backend
- Edite `api/config.php`.
- Para secrets (Google OAuth), use `api/config.local.php` (fora do app) se aplicável.

> O projeto também usa variáveis/overrides para base do backend no frontend.

### 3) Frontend / Cordova
- Garanta que o app aponta para o backend correto em:
  - `www/src/config/env.js`

---

## Como rodar localmente (XAMPP)
1. Inicie Apache e MySQL no **XAMPP**.
2. Garanta que a pasta do projeto esteja no htdocs:
   - `C:\xampp\htdocs\ProjetoAssistente`
3. Execute o schema (se necessário):
   - `api/schema.sql`
4. Acesse:
   - `http://localhost/ProjetoAssistente/`

---

## Como testar o Gemini
- Use o app e fale uma pergunta.
- Ou teste via endpoint com base no seu `device_id`/header `X-Device-Id`.

---

## Como testar o Google Login (PC)
Fluxo esperado:
1. Clique em **Continuar com Google**.
2. O frontend chama `POST /auth/google/init`.
3. O backend retorna `authUrl`.
4. Ao terminar login no Google, o browser retorna para `/auth/google/callback`.
5. O backend devolve `{ token, user }`.

---

## Notas e segurança
- A chave do LLM **não deve** estar no app Cordova.
- Use o backend como “intermediário” para chamadas com segredos.
- Configure o redirect URI no Google Cloud para bater exatamente com o endpoint do callback.

---

## Próximos passos (sugestões)
- Adicionar suporte a GitHub OAuth (já com base no mesmo padrão de contrato).
- Melhorar parsing/formatos de resposta do Gemini.
- Adicionar limpeza automática do histórico (`conversas`) por tempo.
- Implementar telas de log de erro e status do OAuth.
