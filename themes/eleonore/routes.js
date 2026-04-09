// ─── Éleonore custom routes ─────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const db = require('./db');

function register(theme, serveTemplate) {
  const templatesDir = theme.templatesDir;

  return function handleRoute(req, res, url) {
    // Dashboard
    if (req.method === 'GET' && url === '/dashboard') {
      const frenchWords = db.getAllFrenchWords();
      const emotionalNotes = db.getEmotionalNotes();
      const sessionCount = db.getSessionCount();

      const wordRows = frenchWords
        .map(w => `<tr>
          <td class="word">${w.word}</td>
          <td class="meaning">${w.meaning}</td>
          <td class="date">${w.learned_on}</td>
        </tr>`)
        .join('');

      const alertRows = emotionalNotes
        .map(e => `<div class="alert-item">
          <span class="alert-date">${e.date}</span>
          <span class="alert-note">${e.note}</span>
        </div>`)
        .join('');

      const hasAlerts = emotionalNotes.length > 0;

      serveTemplate(res, path.join(templatesDir, 'dashboard.html'), {
        '{{sessionCount}}': String(sessionCount),
        '{{wordCount}}': String(frenchWords.length),
        '{{wordTable}}': wordRows
          ? `<table>${wordRows}</table>`
          : `<div class="no-content">No words recorded yet.</div>`,
        '{{wellbeing}}': hasAlerts
          ? `<div class="alert-banner">Mes confidences — entrées d'une nature délicate</div>${alertRows}`
          : `<div class="no-content">Nothing flagged — all sessions have been positive.</div>`
      });
      return true;
    }

    // Vocab page
    if (req.method === 'GET' && url === '/vocab') {
      const words = db.getAllFrenchWords()
        .sort((a, b) => {
          const strip = w => w.replace(/^(le|la|les|un|une|des|mon|ma|mes|ton|ta|ses|son|l'|d')\s+/i, '');
          return strip(a.word).localeCompare(strip(b.word));
        });

      const cards = words.map((w, i) => {
        const safeWord = w.word.replace(/'/g, '&#39;');
        const date = new Date(w.learned_on).toLocaleDateString('fr-FR', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
        return `<div class="card" id="card-${i}">
          <div class="card-front">
            <div class="card-word">${w.word}</div>
            <button class="speak-btn" data-word="${safeWord}" title="Écouter">♪</button>
          </div>
          <div class="card-meaning">${w.meaning}</div>
          <div class="card-date">appris le ${date}</div>
        </div>`;
      }).join('');

      serveTemplate(res, path.join(templatesDir, 'vocab.html'), {
        '{{wordCount}}': String(words.length),
        '{{cards}}': cards || '<div class="no-results">Aucun mot encore — our lessons have only just begun.</div>'
      });
      return true;
    }

    return false; // not handled
  };
}

module.exports = { register };
