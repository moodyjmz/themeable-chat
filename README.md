# Themeable Chat Platform

A local-first, multi-persona chat platform powered by Claude. Each theme is a self-contained persona with its own system prompt, database, UI styling, and domain knowledge. All data stays on your machine.

## Themes

### Buchhalter (Heinrich Pfennigfuchs)
German tax and accounting assistant. Comprehensive knowledge of Einkommensteuer, Kapitalertraege, crypto taxation, Immobilien, Selbstaendigkeit, and Vorsorge. Supports multiple user profiles with per-user chat history and tagged memory extraction.

- **Port:** 3001
- **Chat model:** Claude Opus
- **Extraction model:** Claude Sonnet
- **Features:** File upload (CSV, PDF, XLSX, MD, TXT, JSON), financial dashboard (SPA), XLSX report export, EN/DE language toggle

#### What gets extracted

| Field | What it captures | Where it shows |
|-------|-----------------|----------------|
| `transactions` | Dates, amounts, categories, tax relevance | Dashboard totals, reports, XLSX export |
| `taxFacts` | Tax-relevant information from conversation | Memory injection |
| `financialContext` | Broader financial situation details | Memory injection |
| `actionItems` | Things the user needs to do | Memory injection |
| `concerns` | Worries or issues flagged by the user | Memory injection |

Transactions require both an explicit date and amount. All extracted facts are tagged with the user who mentioned them (e.g. `[Alice]`, `[Bob]`).

#### Dashboard (SPA)

The Buchhalter theme uses client-side routing — chat, dashboard, and reports are all in a single page. The dashboard shows income/expense totals, tax-relevant transaction count, and document uploads. Reports page offers XLSX export by year.

### Eleonore (Eleonore de Beaumont)
French language and culture companion. A witty aristocratic persona who teaches French conversationally — vocabulary emerges naturally from dialogue rather than drills. Memory extraction tracks what the user talks about, what French words they've learned, and flags emotional concerns.

- **Port:** 3000
- **Chat model:** Claude Opus
- **Extraction model:** Claude Sonnet
- **Features:** French TTS, vocabulary page, dashboard with wellbeing notes

#### What gets extracted

After each conversation (min 4 messages, 5-minute cooldown), Sonnet extracts:

| Field | What it captures | Where it shows |
|-------|-----------------|----------------|
| `frenchWords` | French words/phrases introduced or attempted | Vocabulary page, dashboard, memory injection |
| `interests` | Topics the user engaged with enthusiastically | Memory injection (tiered: strong vs curious) |
| `lifeDetails` | Personal facts the user mentioned about themselves | Memory injection via semantic search |
| `emotionalNotes` | Flags if the user seemed upset or distressed | Dashboard "Wellbeing notes" section |

#### Dashboard

The Eleonore dashboard (`/dashboard`) shows:
- **Session count** and **word count** at a glance
- **French vocabulary table** — every word taught, with meaning and date
- **Wellbeing notes** — emotional flags from conversations (empty when all positive)

The vocabulary page (`/vocab`) shows flashcard-style word cards with TTS pronunciation.

#### Recommended config.local.js

```javascript
// themes/eleonore/config.local.js
module.exports = {
  userName: 'Alice',          // used in memory injection ("Alice is especially interested in...")
  timezone: 'Europe/Berlin',  // for "Right now" context in memory
  userContext: `You are speaking with Alice, a 30-year-old living in Berlin.
She is learning French for an upcoming trip to Paris.
Be encouraging but challenge her — she likes to be pushed.`
};
```

The `userContext` string is appended to the system prompt. This is where you put anything personal about the user — age, goals, family context, learning style, safeguarding rules. Keep it out of `config.js` so it stays off GitHub.

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

## User Profiles

User profiles are configured in `config.local.js`. Each user gets a separate chat history in localStorage. Extracted data is shared but tagged with who mentioned it. See the Buchhalter config example above for the profile format.

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
