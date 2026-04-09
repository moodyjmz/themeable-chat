// ─── Buchhalter SQLite schema and queries ───────────────────────────────────

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'buchhalter.db');
let _db = null;

const DEFAULT_CATEGORIES = [
  // Income
  { name: 'Gehalt', parent: 'Einkommen', tax_category: 'Einkünfte aus nichtselbständiger Arbeit' },
  { name: 'Freelance', parent: 'Einkommen', tax_category: 'Einkünfte aus selbständiger Arbeit' },
  { name: 'Kapitalerträge', parent: 'Einkommen', tax_category: 'Einkünfte aus Kapitalvermögen' },
  { name: 'Mieteinnahmen', parent: 'Einkommen', tax_category: 'Einkünfte aus Vermietung und Verpachtung' },
  { name: 'Crypto', parent: 'Einkommen', tax_category: 'Sonstige Einkünfte (§23 EStG)' },
  { name: 'Kindergeld', parent: 'Einkommen', tax_category: 'steuerfrei' },
  { name: 'ALG1', parent: 'Einkommen', tax_category: 'Progressionsvorbehalt' },
  // Housing
  { name: 'Miete', parent: 'Wohnen', tax_category: null },
  { name: 'Nebenkosten', parent: 'Wohnen', tax_category: 'haushaltsnahe Dienstleistungen (anteilig)' },
  { name: 'Strom', parent: 'Wohnen', tax_category: null },
  { name: 'Gas/Heizung', parent: 'Wohnen', tax_category: null },
  { name: 'Rundfunkbeitrag', parent: 'Wohnen', tax_category: null },
  // Transport
  { name: 'Kfz-Versicherung', parent: 'Verkehr', tax_category: 'Vorsorgeaufwendungen (anteilig)' },
  { name: 'Tanken', parent: 'Verkehr', tax_category: null },
  { name: 'Pendlerpauschale', parent: 'Verkehr', tax_category: 'Werbungskosten' },
  // Work
  { name: 'Arbeitsmittel', parent: 'Beruf', tax_category: 'Werbungskosten' },
  { name: 'Fortbildung', parent: 'Beruf', tax_category: 'Werbungskosten' },
  { name: 'Homeoffice', parent: 'Beruf', tax_category: 'Werbungskosten (Homeoffice-Pauschale)' },
  { name: 'Berufskleidung', parent: 'Beruf', tax_category: 'Werbungskosten' },
  { name: 'Gewerkschaftsbeiträge', parent: 'Beruf', tax_category: 'Werbungskosten' },
  // Insurance
  { name: 'Krankenversicherung', parent: 'Versicherungen', tax_category: 'Vorsorgeaufwendungen' },
  { name: 'Haftpflicht', parent: 'Versicherungen', tax_category: 'Sonderausgaben' },
  { name: 'Lebensversicherung', parent: 'Versicherungen', tax_category: 'Vorsorgeaufwendungen' },
  { name: 'Berufsunfähigkeit', parent: 'Versicherungen', tax_category: 'Vorsorgeaufwendungen' },
  // Family
  { name: 'Kinderbetreuung', parent: 'Familie', tax_category: 'Sonderausgaben' },
  { name: 'Schulgeld', parent: 'Familie', tax_category: 'Sonderausgaben' },
  { name: 'Unterhalt', parent: 'Familie', tax_category: 'Sonderausgaben / außergewöhnliche Belastungen' },
  // Living
  { name: 'Lebensmittel', parent: 'Lebenshaltung', tax_category: null },
  { name: 'Kleidung', parent: 'Lebenshaltung', tax_category: null },
  { name: 'Gesundheit', parent: 'Lebenshaltung', tax_category: 'außergewöhnliche Belastungen (ggf.)' },
  { name: 'Freizeit', parent: 'Lebenshaltung', tax_category: null },
  // Crypto
  { name: 'Crypto Kauf', parent: 'Investitionen', tax_category: 'Anschaffung (§23 EStG)' },
  { name: 'Crypto Verkauf', parent: 'Investitionen', tax_category: 'Veräußerung (§23 EStG) — prüfe Haltefrist' },
  { name: 'Staking Rewards', parent: 'Investitionen', tax_category: 'Sonstige Einkünfte (§22 Nr. 3 EStG)' },
  // Tax
  { name: 'Steuernachzahlung', parent: 'Steuern', tax_category: null },
  { name: 'Steuererstattung', parent: 'Steuern', tax_category: null },
  { name: 'Steuerberater', parent: 'Steuern', tax_category: 'Werbungskosten / Betriebsausgaben' },
  // Donations
  { name: 'Spenden', parent: 'Sonstiges', tax_category: 'Sonderausgaben' },
];

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      category TEXT,
      subcategory TEXT,
      tax_relevant INTEGER NOT NULL DEFAULT 0,
      tax_category TEXT,
      source TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      parent TEXT,
      tax_category TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0,
      transaction_count INTEGER DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS tax_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER UNIQUE NOT NULL,
      steuerklasse TEXT,
      filing_status TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      messages TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profile (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed default categories if empty
  const catCount = _db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
  if (catCount === 0) {
    const insert = _db.prepare('INSERT OR IGNORE INTO categories (name, parent, tax_category) VALUES (?, ?, ?)');
    const tx = _db.transaction(() => {
      for (const cat of DEFAULT_CATEGORIES) {
        insert.run(cat.name, cat.parent, cat.tax_category);
      }
    });
    tx();
  }

  return _db;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

function addSession(date, messagesJson) {
  getDb().prepare('INSERT INTO sessions (date, messages) VALUES (?, ?)').run(date, messagesJson);
}

function getSessionCount() {
  return getDb().prepare('SELECT COUNT(*) AS count FROM sessions').get().count;
}

// ─── Profile ────────────────────────────────────────────────────────────────

function getProfile(key) {
  const row = getDb().prepare('SELECT value FROM profile WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setProfile(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO profile (key, value) VALUES (?, ?)').run(key, value);
}

// ─── Transactions ───────────────────────────────────────────────────────────

function addTransaction(tx) {
  const db = getDb();
  // Dedup: skip if same date + description + amount already exists
  const existing = db.prepare(
    'SELECT id FROM transactions WHERE date = ? AND description = ? AND amount = ?'
  ).get(tx.date, tx.description, tx.amount);
  if (existing) return;

  db.prepare(`
    INSERT INTO transactions (date, description, amount, currency, category, subcategory, tax_relevant, tax_category, source, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tx.date, tx.description, tx.amount, tx.currency || 'EUR',
    tx.category, tx.subcategory || null,
    tx.taxRelevant ? 1 : 0, tx.taxCategory || null,
    tx.source || 'chat', tx.notes || null
  );
}

function getTransactionsByYear(year) {
  return getDb().prepare(
    "SELECT * FROM transactions WHERE strftime('%Y', date) = ? ORDER BY date"
  ).all(String(year));
}

function getTransactionSummaryByYear(year) {
  return getDb().prepare(`
    SELECT category,
           SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
           SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) AS expenses,
           COUNT(*) AS count
    FROM transactions
    WHERE strftime('%Y', date) = ?
    GROUP BY category
    ORDER BY category
  `).all(String(year));
}

function getTaxRelevantByYear(year) {
  return getDb().prepare(
    "SELECT * FROM transactions WHERE tax_relevant = 1 AND strftime('%Y', date) = ? ORDER BY date"
  ).all(String(year));
}

function getCryptoTransactionsByYear(year) {
  return getDb().prepare(
    "SELECT * FROM transactions WHERE (category LIKE '%Crypto%' OR category LIKE '%crypto%') AND strftime('%Y', date) = ? ORDER BY date"
  ).all(String(year));
}

function getYearTotals(year) {
  const row = getDb().prepare(`
    SELECT
      SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total_income,
      SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) AS total_expenses,
      COUNT(*) AS transaction_count
    FROM transactions
    WHERE strftime('%Y', date) = ?
  `).get(String(year));
  return row || { total_income: 0, total_expenses: 0, transaction_count: 0 };
}

// ─── Documents ──────────────────────────────────────────────────────────────

function addDocument(doc) {
  const result = getDb().prepare(`
    INSERT INTO documents (filename, original_name, file_type, processed, transaction_count, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(doc.filename, doc.originalName, doc.fileType, doc.processed ? 1 : 0, doc.transactionCount || 0, doc.notes || null);
  return result.lastInsertRowid;
}

function updateDocumentProcessed(id, transactionCount) {
  getDb().prepare('UPDATE documents SET processed = 1, transaction_count = ? WHERE id = ?').run(transactionCount, id);
}

function getRecentDocuments(limit = 10) {
  return getDb().prepare('SELECT * FROM documents ORDER BY uploaded_at DESC LIMIT ?').all(limit);
}

// ─── Categories ─────────────────────────────────────────────────────────────

function getAllCategories() {
  return getDb().prepare('SELECT * FROM categories ORDER BY parent, name').all();
}

function getCategoryByName(name) {
  return getDb().prepare('SELECT * FROM categories WHERE name = ?').get(name);
}

// ─── Tax Years ──────────────────────────────────────────────────────────────

function getTaxYear(year) {
  return getDb().prepare('SELECT * FROM tax_years WHERE year = ?').get(year);
}

function setTaxYear(year, steuerklasse, filingStatus, notes) {
  getDb().prepare(`
    INSERT OR REPLACE INTO tax_years (year, steuerklasse, filing_status, notes)
    VALUES (?, ?, ?, ?)
  `).run(year, steuerklasse, filingStatus, notes);
}

// ─── Memory merge (called after extraction) ─────────────────────────────────

async function mergeExtracted(extracted, addFact, userName) {
  const today = new Date().toISOString().split('T')[0];
  const tag = userName || 'unknown';

  for (const tx of (extracted.transactions || [])) {
    addTransaction({
      date: tx.date || today,
      description: tx.description,
      amount: tx.amount,
      category: tx.category,
      taxRelevant: tx.taxRelevant,
      source: `chat:${tag}`
    });
  }

  for (const fact of (extracted.taxFacts || [])) {
    await addFact(`[${tag}] ${fact}`, { category: 'tax_fact', date: today, user: tag });
  }

  for (const ctx of (extracted.financialContext || [])) {
    await addFact(`[${tag}] ${ctx}`, { category: 'financial_context', date: today, user: tag });
  }

  for (const item of (extracted.actionItems || [])) {
    await addFact(`[${tag}] ${item}`, { category: 'action_item', date: today, user: tag });
  }
}

// ─── Build memory injection ─────────────────────────────────────────────────

async function buildMemoryInjection(recentMessages, queryFactsMulti) {
  const lines = [];

  const sessionCount = getSessionCount();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentYear = now.getFullYear();

  lines.push(`Heutiges Datum: ${today}`);
  lines.push(`Bisherige Gespräche: ${sessionCount}`);

  const lastConversation = getProfile('last_conversation_date');
  if (lastConversation) {
    const days = Math.floor((Date.now() - new Date(lastConversation).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) lines.push('Letztes Gespräch: heute.');
    else if (days === 1) lines.push('Letztes Gespräch: gestern.');
    else lines.push(`Letztes Gespräch: vor ${days} Tagen.`);
  }

  // Year totals
  const totals = getYearTotals(currentYear);
  if (totals.transaction_count > 0) {
    lines.push(`\n${currentYear} bisher: ${totals.transaction_count} Transaktionen, Einnahmen: €${(totals.total_income || 0).toFixed(2)}, Ausgaben: €${Math.abs(totals.total_expenses || 0).toFixed(2)}`);
  }

  // Tax year info
  const taxYear = getTaxYear(currentYear);
  if (taxYear) {
    if (taxYear.steuerklasse) lines.push(`Steuerklasse: ${taxYear.steuerklasse}`);
    if (taxYear.filing_status) lines.push(`Veranlagung: ${taxYear.filing_status}`);
  }

  // Financial context from vectra
  const queryTexts = (recentMessages || []).slice(-3);
  const vectraQueries = queryTexts.length > 0
    ? queryTexts
    : ['financial situation tax income expenses'];
  try {
    const results = await queryFactsMulti(vectraQueries, 20);
    const taxFacts = results.filter(r => r.category === 'tax_fact');
    const financialCtx = results.filter(r => r.category === 'financial_context');
    const actionItems = results.filter(r => r.category === 'action_item');

    if (taxFacts.length) {
      lines.push('\nSteuerliche Fakten:');
      taxFacts.forEach(r => lines.push(`  - ${r.text}`));
    }
    if (financialCtx.length) {
      lines.push('\nFinanzielle Situation:');
      financialCtx.forEach(r => lines.push(`  - ${r.text}`));
    }
    if (actionItems.length) {
      lines.push('\nOffene Aufgaben:');
      actionItems.forEach(r => lines.push(`  - ${r.text}`));
    }
  } catch (err) {
    console.error('Vectra query failed:', err.message);
  }

  return lines.join('\n');
}

module.exports = {
  getDb,
  addSession, getSessionCount,
  getProfile, setProfile,
  addTransaction, getTransactionsByYear, getTransactionSummaryByYear,
  getTaxRelevantByYear, getCryptoTransactionsByYear, getYearTotals,
  addDocument, updateDocumentProcessed, getRecentDocuments,
  getAllCategories, getCategoryByName,
  getTaxYear, setTaxYear,
  mergeExtracted,
  buildMemoryInjection
};
