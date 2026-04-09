# Themeable Chat Platform

A local-first, multi-persona chat platform powered by Claude. Each theme is a self-contained persona with its own system prompt, database, UI styling, and domain knowledge. All data stays on your machine.

## Themes

### Buchhalter (Heinrich Pfennigfuchs)
German tax and accounting assistant. Comprehensive knowledge of Einkommensteuer, Kapitalertraege, crypto taxation, Immobilien, Selbstaendigkeit, and Vorsorge. Supports two user profiles (Nicki / James) with per-user chat history and tagged memory extraction.

- **Port:** 3001
- **Chat model:** Claude Opus
- **Extraction model:** Claude Sonnet
- **Features:** File upload (CSV, PDF, XLSX, MD, TXT, JSON), financial dashboard, XLSX report export, EN/DE language toggle

### Eleonore (Eleonore de Beaumont)
French language and culture companion. Conversational French practice with vocabulary tracking and speech synthesis.

- **Port:** 3000
- **Chat model:** Claude Opus
- **Extraction model:** Claude Sonnet
- **Features:** French TTS, vocabulary page, dashboard

## Quick Start

```bash
npm install

# Set your API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Run a theme
THEME=buchhalter node server.js
THEME=eleonore node server.js

# Or use npm scripts
npm run buchhalter
npm run eleonore
```

## Configuration

Each theme has a `config.js` with sensible defaults and an optional `config.local.js` for personal overrides. The local file is gitignored.

### API Key

Set your Anthropic API key in one of two ways:

1. **`.env` file** (recommended) — create `.env` in the project root:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
2. **Environment variable** — export it in your shell:
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

The `.env` file is gitignored and loaded automatically on server start.

### Personal Overrides

Create `themes/<id>/config.local.js` to override any default config value. This is where you put user profiles, personal preferences, or anything you don't want published:

```javascript
// themes/buchhalter/config.local.js
module.exports = {
  users: {
    default: 'user1',
    profiles: {
      user1: {
        name: 'Alice',
        promptHint: 'You are speaking with Alice. She prefers...'
      },
      user2: {
        name: 'Bob',
        promptHint: 'You are speaking with Bob. He is interested in...'
      }
    }
  }
};
```

Local config is deep-merged with defaults — you only need to specify what you're overriding.

### What's Gitignored

| File | Contains |
|------|----------|
| `.env` | API key |
| `themes/*/config.local.js` | User profiles, personal overrides |
| `data/*.db` | SQLite databases (conversations, transactions) |
| `data/memory_index/` | Vectra semantic memory index |
| `uploads/` | Uploaded files |

## Architecture

```
server.js                  Shared HTTP server, routing, memory cache
core/
  api-proxy.js             Anthropic API proxy with retry/fallback
  memory.js                LLM-based memory extraction
  session.js               Extraction throttling (min 4 messages, 5min cooldown)
  file-processor.js        File upload parsing (CSV, PDF, XLSX, images, text)
public/
  base.css                 CSS variable base — themes override via custom properties
  chat.js                  Shared chat UI logic, localStorage persistence, markdown rendering
  speech.js                French TTS (loaded conditionally per theme)
data/
  memory-index.js          Vectra vector index operations
  embeddings.js            HuggingFace local embeddings (paraphrase-multilingual-MiniLM-L12-v2)
  *.db                     Per-theme SQLite databases
  memory_index/            Vectra index files
themes/<id>/
  config.js                Models, ports, labels, user profiles, i18n strings
  prompts.js               System prompt, extraction prompt, memory injection assembly
  db.js                    SQLite schema, queries, memory merge logic
  routes.js                Theme-specific HTTP routes and API endpoints
  theme.css                CSS variable overrides and theme-specific styles
  templates/               HTML templates
```

## How Memory Works

1. **Chat** — User talks to the persona via Claude (Opus)
2. **Save** — Conversation is saved to SQLite sessions table
3. **Extract** — After 4+ new messages and a 5-minute cooldown, Claude (Sonnet) extracts structured data from the conversation
4. **Store** — Extracted facts go to Vectra (semantic search) and SQLite (structured queries), tagged with the user who said them
5. **Inject** — On next chat, relevant facts are retrieved via semantic search and injected into the system prompt as context
6. **Cache** — Memory injection is cached for 60 seconds to avoid repeated embedding work

### Buchhalter Extraction Schema

```json
{
  "transactions": [{ "date": "YYYY-MM-DD", "description": "", "amount": 0, "category": "", "taxRelevant": true }],
  "taxFacts": [""],
  "financialContext": [""],
  "actionItems": [""],
  "concerns": [""]
}
```

Transactions require both an explicit date and amount. Facts are tagged with the user name (`[Nicki]`, `[James]`) for attribution.

## SPA Navigation (Buchhalter)

The Buchhalter theme uses client-side routing — chat, dashboard, and reports are all in a single page. Switching views preserves chat state. URLs update via `pushState` so the back button works.

## User Profiles (Buchhalter)

Two profiles with different prompt hints:
- **Nicki** — Practical focus: deductions, family benefits, budgeting, property costs
- **James** — Technical focus: crypto taxation, investment optimisation, AfA strategies

Each user has a separate chat history in localStorage. Extracted data is shared (same household) but tagged with who mentioned it.

## Token Optimisation

- System prompt compressed to ~1,000 tokens (reference format, not prose)
- Chat context uses a 20-message sliding window
- Extraction throttled: min 4 new messages + 5-minute cooldown
- Memory injection cached for 60 seconds
- Save deduplication prevents redundant server calls on page exit

## Dependencies

| Package | Purpose |
|---------|---------|
| better-sqlite3 | Structured data storage |
| vectra | Local vector search (semantic memory) |
| @huggingface/transformers | Local embedding model |
| onnxruntime-node | ONNX inference for embeddings |
| busboy | Multipart file upload parsing |
| csv-parser | CSV file processing |
| pdf-parse | PDF text extraction |
| exceljs | XLSX report generation |

## Adding a Theme

1. Create `themes/<id>/` with `config.js`, `prompts.js`, `db.js`, `routes.js`, `theme.css`, and `templates/`
2. Set unique `port` in config
3. Define system prompt with domain knowledge
4. Define extraction prompt and merge logic
5. Create SQLite schema for domain-specific data
6. Override CSS variables in `theme.css`
7. Run with `THEME=<id> node server.js`
