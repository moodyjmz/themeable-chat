// ─── Themeable Chat Platform — shared server ────────────────────────────────

// Load .env file if present
const envPath = require('path').join(__dirname, '.env');
if (require('fs').existsSync(envPath)) {
  for (const line of require('fs').readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.+)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadTheme } = require('./themes/theme');
const { proxyToAnthropic } = require('./core/api-proxy');
const { extractMemory } = require('./core/memory');
const { getNewMessages, resetExtraction } = require('./core/session');
const { addFact, queryFactsMulti, listFactsByCategory } = require('./data/memory-index');

// ─── Load active theme ──────────────────────────────────────────────────────

const theme = loadTheme();
const { config, prompts, db, routes } = theme;

console.log(`Theme: ${config.name} (${config.id})`);

// ─── Helpers ────────────────────────────────────────────────────────────────

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'Content-Type': contentType }).end(data);
  });
}

function serveTemplate(res, filePath, vars) {
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.writeHead(404).end('Not found');
    Object.entries(vars).forEach(([key, val]) => {
      html = html.split(key).join(val);
    });
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
  });
}

// ─── Memory extraction ─────────────────────────────────────────────────────

async function extractAndMerge(messages, userName) {
  const transcript = prompts.formatTranscript(messages);
  const extractionPrompt = prompts.buildExtractionPrompt(config);
  const extracted = await extractMemory(
    config.apiKey,
    config.models.extraction,
    config.maxTokens.extraction,
    extractionPrompt,
    transcript
  );

  if (!extracted) return;

  await db.mergeExtracted(extracted, addFact, userName);
  console.log('Memory updated:', JSON.stringify(extracted, null, 2));
}

// ─── Memory injection cache (avoid repeated heavy embedding work) ───────────

let cachedInjection = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

async function getMemoryInjection(recentMessages) {
  const now = Date.now();
  if (cachedInjection && (now - cacheTime) < CACHE_TTL) {
    return cachedInjection;
  }
  cachedInjection = await db.buildMemoryInjection(recentMessages, queryFactsMulti, config);
  cacheTime = now;
  return cachedInjection;
}

function invalidateCache() {
  cachedInjection = null;
  cacheTime = 0;
}

// ─── Register theme routes ──────────────────────────────────────────────────

const handleThemeRoute = routes.register(theme, serveTemplate);

// ─── Build Google Fonts URL ─────────────────────────────────────────────────

const googleFontsParam = (config.googleFonts || []).join('&family=');

// ─── Chat template vars ────────────────────────────────────────────────────

function getChatTemplateVars() {
  return {
    '{{themeName}}': config.name,
    '{{themeIcon}}': config.icon,
    '{{themeSubtitle}}': config.subtitle,
    '{{themeIntro}}': config.introText,
    '{{placeholder}}': config.labels.placeholder,
    '{{sendLabel}}': config.labels.send,
    '{{googleFonts}}': googleFontsParam,
    '{{i18n}}': JSON.stringify(config.i18n || {}),
    '{{users}}': JSON.stringify(config.users || 'null')
  };
}

// ─── HTTP server ────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  console.log(req.method, req.url);

  const [url, queryString] = req.url.split('?');
  const params = new URLSearchParams(queryString || '');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  // ─── Shared routes ──────────────────────────────────────────────────────

  // Prompt endpoint
  if (req.method === 'GET' && url === '/prompt') {
    // Resolve user profile for themes that support it
    let userProfileHint = '';
    if (config.users) {
      const userId = params.get('user') || config.users.default;
      const profile = config.users.profiles[userId];
      if (profile) userProfileHint = profile.promptHint;
    }

    const basePrompt = prompts.buildSystemPrompt(config, userProfileHint);
    getMemoryInjection([]).then(injection => {
      const systemPrompt = prompts.assemblePrompt(basePrompt, injection);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        systemPrompt,
        models: config.models,
        maxTokens: config.maxTokens,
        theme: { id: config.id },
        users: config.users || null
      }));
    }).catch(err => {
      console.error('Prompt assembly failed:', err);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        systemPrompt: basePrompt,
        models: config.models,
        maxTokens: config.maxTokens,
        theme: { id: config.id }
      }));
    });
    return;
  }

  // Save session
  if (req.method === 'POST' && url === '/save') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { messages, isNew, user } = JSON.parse(body);
        if (!messages || messages.length === 0) {
          res.writeHead(200).end('OK');
          return;
        }

        // Resolve user name for tagging
        const userName = config.users?.profiles?.[user]?.name || user || 'unknown';

        if (isNew) {
          db.setProfile('last_conversation_date', new Date().toISOString());
        }

        db.addSession(new Date().toISOString(), JSON.stringify(messages));
        res.writeHead(200).end('OK');

        const newMessages = getNewMessages(messages);
        if (newMessages) {
          extractAndMerge(newMessages, userName).then(() => {
            invalidateCache();
          }).catch(err => {
            console.error('Memory extraction failed:', err.message);
          });
        }

      } catch {
        res.writeHead(400).end('Bad request');
      }
    });
    return;
  }

  // API proxy
  if (req.method === 'POST' && url === '/api') {
    proxyToAnthropic(config.apiKey, config.models.extraction, req, res);
    return;
  }

  // ─── Static assets ────────────────────────────────────────────────────────

  if (req.method === 'GET' && url === '/base.css') {
    serveFile(res, path.join(__dirname, 'public', 'base.css'), 'text/css');
    return;
  }

  if (req.method === 'GET' && url === '/theme.css') {
    serveFile(res, theme.cssPath, 'text/css');
    return;
  }

  if (req.method === 'GET' && url === '/chat.js') {
    serveFile(res, path.join(__dirname, 'public', 'chat.js'), 'application/javascript');
    return;
  }

  if (req.method === 'GET' && url === '/speech.js') {
    if (config.features.speech) {
      serveFile(res, path.join(__dirname, 'public', 'speech.js'), 'application/javascript');
    } else {
      // Empty script for themes without speech
      res.writeHead(200, { 'Content-Type': 'application/javascript' }).end('');
    }
    return;
  }

  // ─── Theme-specific routes ────────────────────────────────────────────────

  if (handleThemeRoute(req, res, url)) return;

  // ─── Default: serve chat page ─────────────────────────────────────────────

  if (req.method === 'GET') {
    const chatTemplate = path.join(theme.templatesDir, 'chat.html');
    fs.readFile(chatTemplate, 'utf8', (err, html) => {
      if (err) return res.writeHead(404).end('Not found');

      const vars = getChatTemplateVars();
      Object.entries(vars).forEach(([key, val]) => {
        html = html.split(key).join(val);
      });

      // Inject data attributes for JS (match <body> or <body ...>)
      html = html.replace(/<body([^>]*)>/, `<body$1 data-theme="${config.id}" data-assistant-name="${config.labels.assistantName}" data-user-name="${config.labels.userName}">`);

      res.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
    });
    return;
  }

  res.writeHead(404).end('Not found');
});

// ─── Start ──────────────────────────────────────────────────────────────────

const port = config.port || 3000;
server.listen(port, () => {
  console.log(`${config.name} running at http://localhost:${port}`);

  // Warm embedding model
  require('./data/embeddings').getEmbedder().then(() => console.log('Embeddings model ready'));

  // Éleonore-specific: migrate vectra interests to SQLite (one-time, idempotent)
  if (config.id === 'eleonore' && !db.getProfile('interests_migrated')) {
    listFactsByCategory('interest').then(items => {
      if (items.length === 0) {
        db.setProfile('interests_migrated', '1');
        return;
      }
      for (const item of items) {
        db.upsertInterest(item.metadata.text, item.metadata.date || 'unknown');
      }
      db.setProfile('interests_migrated', '1');
      console.log(`Migrated ${items.length} interests from vectra to SQLite`);
    }).catch(err => {
      console.error('Interest migration failed:', err.message);
    });
  }
});
