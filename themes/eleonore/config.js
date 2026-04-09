// ─── Eleonore theme config ──────────────────────────────────────────────────
// Personal overrides go in config.local.js (gitignored)

const path = require('path');
const fs = require('fs');

const defaults = {
  id: 'eleonore',
  name: 'Eleonore de Beaumont',
  tagline: 'Paris, France',
  subtitle: 'Paris, France',
  icon: '👑',
  introText: 'Ah, bonjour. I am Eleonore de Beaumont. I have dined with kings, argued with emperors, and know more secrets about Europe than most people know facts. Ask me anything — I never reveal my sources, but I always reveal the truth.',
  port: 3000,

  apiKey: process.env.ANTHROPIC_API_KEY || '',

  models: {
    chat: 'claude-opus-4-6',
    extraction: 'claude-sonnet-4-6'
  },

  maxTokens: {
    chat: 2000,
    extraction: 1000
  },

  features: {
    fileUpload: false,
    speech: true,
    vocabPage: true,
    reportsPage: false
  },

  googleFonts: [
    'Playfair+Display:ital,wght@0,400;0,700;1,400;1,600',
    'Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400'
  ],

  labels: {
    send: 'Envoyer',
    placeholder: 'Ask Eleonore something\u2026',
    userName: 'You',
    assistantName: 'Eleonore'
  }
};

// Merge local overrides if present
const localPath = path.join(__dirname, 'config.local.js');
if (fs.existsSync(localPath)) {
  const local = require(localPath);
  const merged = { ...defaults, ...local };
  if (local.models) merged.models = { ...defaults.models, ...local.models };
  if (local.maxTokens) merged.maxTokens = { ...defaults.maxTokens, ...local.maxTokens };
  if (local.features) merged.features = { ...defaults.features, ...local.features };
  if (local.labels) merged.labels = { ...defaults.labels, ...local.labels };
  module.exports = merged;
} else {
  module.exports = defaults;
}
