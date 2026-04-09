// ─── Buchhalter theme config ────────────────────────────────────────────────
// Personal overrides (API key, user profiles) go in config.local.js (gitignored)

const path = require('path');
const fs = require('fs');

const defaults = {
  id: 'buchhalter',
  name: 'Heinrich Pfennigfuchs',
  tagline: 'Ihr persoenlicher Finanzassistent',
  subtitle: 'Lokal. Sicher. Gruendlich.',
  icon: '📊',
  introText: 'Guten Tag. Heinrich Pfennigfuchs, zu Ihren Diensten. Gruendlich, zuverlaessig, und jeder Cent wird verfolgt — so wie es sich gehoert.',
  port: 3001,

  apiKey: process.env.ANTHROPIC_API_KEY || '',

  models: {
    chat: 'claude-opus-4-6',
    extraction: 'claude-sonnet-4-6'
  },

  maxTokens: {
    chat: 2048,
    extraction: 2048
  },

  features: {
    fileUpload: true,
    speech: false,
    vocabPage: false,
    reportsPage: true
  },

  googleFonts: [
    'DM+Serif+Display:ital@0;1',
    'Source+Sans+3:ital,wght@0,300;0,400;0,600;1,300;1,400'
  ],

  labels: {
    send: 'Senden',
    placeholder: 'Fragen Sie Herrn Pfennigfuchs\u2026',
    userName: 'Sie',
    assistantName: 'Pfennigfuchs'
  },

  // Default single-user setup — override in config.local.js for multi-user
  users: null,

  i18n: {
    de: {
      send: 'Senden',
      placeholder: 'Fragen Sie Herrn Pfennigfuchs\u2026',
      userName: 'Sie',
      assistantName: 'Pfennigfuchs',
      subtitle: 'Lokal. Sicher. Gruendlich.',
      intro: 'Guten Tag. Heinrich Pfennigfuchs, zu Ihren Diensten. Gruendlich, zuverlaessig, und jeder Cent wird verfolgt — so wie es sich gehoert.',
      uploadTitle: 'Datei hochladen',
      dashboard: 'Uebersicht',
      reports: 'Berichte',
      langToggle: 'EN'
    },
    en: {
      send: 'Send',
      placeholder: 'Ask Herr Pfennigfuchs\u2026',
      userName: 'You',
      assistantName: 'Pfennigfuchs',
      subtitle: 'Local. Secure. Thorough.',
      intro: 'Good day. Heinrich Pfennigfuchs, at your service. Thorough, reliable, and every cent accounted for — as it should be.',
      uploadTitle: 'Upload file',
      dashboard: 'Overview',
      reports: 'Reports',
      langToggle: 'DE'
    }
  }
};

// Merge local overrides if present
const localPath = path.join(__dirname, 'config.local.js');
if (fs.existsSync(localPath)) {
  const local = require(localPath);
  const merged = { ...defaults, ...local };
  // Deep merge nested objects
  if (local.models) merged.models = { ...defaults.models, ...local.models };
  if (local.maxTokens) merged.maxTokens = { ...defaults.maxTokens, ...local.maxTokens };
  if (local.features) merged.features = { ...defaults.features, ...local.features };
  if (local.labels) merged.labels = { ...defaults.labels, ...local.labels };
  if (local.i18n) {
    merged.i18n = { ...defaults.i18n };
    if (local.i18n.de) merged.i18n.de = { ...defaults.i18n.de, ...local.i18n.de };
    if (local.i18n.en) merged.i18n.en = { ...defaults.i18n.en, ...local.i18n.en };
  }
  module.exports = merged;
} else {
  module.exports = defaults;
}
