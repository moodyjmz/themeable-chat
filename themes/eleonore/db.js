// ─── Éleonore SQLite schema and queries ─────────────────────────────────────

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'eleonore.db');
let _db = null;

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS french_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT UNIQUE COLLATE NOCASE,
      meaning TEXT NOT NULL,
      learned_on TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      messages TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emotional_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note TEXT NOT NULL,
      date TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profile (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT UNIQUE COLLATE NOCASE,
      display_topic TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      last_mentioned TEXT NOT NULL
    );
  `);
  return _db;
}

// ─── French words ───────────────────────────────────────────────────────────

function addFrenchWord(word, meaning, learnedOn) {
  getDb().prepare('INSERT OR IGNORE INTO french_words (word, meaning, learned_on) VALUES (?, ?, ?)').run(word, meaning, learnedOn);
}

function getAllFrenchWords() {
  return getDb().prepare('SELECT word, meaning, learned_on FROM french_words ORDER BY learned_on DESC').all();
}

function getFrenchWordCount() {
  return getDb().prepare('SELECT COUNT(*) AS count FROM french_words').get().count;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

function addSession(date, messagesJson) {
  getDb().prepare('INSERT INTO sessions (date, messages) VALUES (?, ?)').run(date, messagesJson);
}

function getSessionCount() {
  return getDb().prepare('SELECT COUNT(*) AS count FROM sessions').get().count;
}

function getLastSessionDate() {
  const row = getDb().prepare('SELECT date FROM sessions ORDER BY id DESC LIMIT 1').get();
  return row ? row.date : null;
}

// ─── Emotional notes ────────────────────────────────────────────────────────

function addEmotionalNote(note, date) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM emotional_notes WHERE note = ? AND date = ?').get(note, date);
  if (existing) return;
  db.prepare('INSERT INTO emotional_notes (note, date) VALUES (?, ?)').run(note, date);
  db.prepare(`
    DELETE FROM emotional_notes WHERE id NOT IN (
      SELECT id FROM emotional_notes ORDER BY id DESC LIMIT 10
    )
  `).run();
}

function getEmotionalNotes() {
  return getDb().prepare('SELECT note, date FROM emotional_notes ORDER BY id DESC').all();
}

// ─── Interests ──────────────────────────────────────────────────────────────

function upsertInterest(topic, date) {
  const db = getDb();
  const existing = db.prepare('SELECT id, count FROM interests WHERE topic = ?').get(topic);
  if (existing) {
    db.prepare('UPDATE interests SET count = count + 1, last_mentioned = ?, display_topic = ? WHERE id = ?')
      .run(date, topic, existing.id);
  } else {
    db.prepare('INSERT INTO interests (topic, display_topic, count, last_mentioned) VALUES (?, ?, 1, ?)')
      .run(topic.toLowerCase(), topic, date);
  }
}

function getAllInterests() {
  return getDb().prepare('SELECT display_topic AS topic, count, last_mentioned FROM interests ORDER BY count DESC, last_mentioned DESC').all();
}

// ─── Profile ────────────────────────────────────────────────────────────────

function getProfile(key) {
  const row = getDb().prepare('SELECT value FROM profile WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setProfile(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO profile (key, value) VALUES (?, ?)').run(key, value);
}

// ─── Memory merge (called after extraction) ─────────────────────────────────

async function mergeExtracted(extracted, addFact) {
  const today = new Date().toISOString().split('T')[0];

  for (const entry of (extracted.frenchWords || [])) {
    addFrenchWord(entry.word, entry.meaning, today);
  }
  for (const note of (extracted.emotionalNotes || [])) {
    addEmotionalNote(note, today);
  }
  for (const interest of (extracted.interests || [])) {
    upsertInterest(interest, today);
  }
  for (const detail of (extracted.lifeDetails || [])) {
    await addFact(detail, { category: 'life_detail', date: today });
  }
}

// ─── Build memory injection ─────────────────────────────────────────────────

async function buildMemoryInjection(recentMessages, queryFactsMulti, config) {
  const lines = [];
  const userName = config?.userName || 'the user';

  const sessionCount = getSessionCount();
  const wordCount = getFrenchWordCount();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const tz = config?.timezone || 'Europe/Berlin';
  const dayOfWeek = now.toLocaleDateString('en-GB', { weekday: 'long', timeZone: tz });
  const timeLocal = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  lines.push(`Right now: ${dayOfWeek}, ${today}, ${timeLocal}.`);
  lines.push('Dates appear throughout — one-off events mentioned weeks ago have likely passed (ask how they went); ongoing things (hobbies, interests, friendships) are still current unless they say otherwise.');
  lines.push(`Shared history: you have spoken with ${userName} across ${sessionCount} conversation${sessionCount !== 1 ? 's' : ''}, and have taught ${wordCount} French word${wordCount !== 1 ? 's' : ''} so far.`);

  const lastConversation = getProfile('last_conversation_date');
  if (lastConversation) {
    const days = Math.floor((Date.now() - new Date(lastConversation).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) lines.push(`Time since your last conversation with ${userName}: earlier today.`);
    else if (days === 1) lines.push(`Time since your last conversation with ${userName}: yesterday.`);
    else lines.push(`Time since your last conversation with ${userName}: ${days} days.`);
  }

  // Life details from vectra
  const queryTexts = (recentMessages || []).slice(-3);
  const vectraQueries = queryTexts.length > 0
    ? queryTexts
    : ['personal details family life interests'];
  try {
    const results = await queryFactsMulti(vectraQueries, 20);
    const lifeDetails = results.filter(r => r.category === 'life_detail');
    if (lifeDetails.length) {
      lines.push(`\nThings ${userName} has told you about themselves:`);
      lifeDetails.forEach(r => lines.push(`  - [${r.date || 'unknown'}] ${r.text}`));
    }
  } catch (err) {
    console.error('Vectra query failed:', err.message);
  }

  // Interests — two-tier display
  const allInterests = getAllInterests();
  const strong = allInterests.filter(i => i.count >= 3);
  const curious = allInterests.filter(i => i.count < 3);

  if (strong.length) {
    lines.push(`\n${userName} is especially interested in:`);
    strong.forEach(i => lines.push(`  - ${i.topic} (last ${i.last_mentioned})`));
  }
  if (curious.length) {
    const shown = curious.length > 5
      ? curious.sort((a, b) => b.last_mentioned.localeCompare(a.last_mentioned)).slice(0, 5)
      : curious;
    lines.push('\nAlso shown some curiosity about:');
    shown.forEach(i => lines.push(`  - ${i.topic} (last ${i.last_mentioned})`));
  }

  // French words — grouped by date
  const words = getAllFrenchWords();
  if (words.length) {
    lines.push('\nFrench words you have taught (do not re-teach as new):');

    const byDate = {};
    words.forEach(w => {
      if (!byDate[w.learned_on]) byDate[w.learned_on] = [];
      byDate[w.learned_on].push(w);
    });

    const dates = Object.keys(byDate).sort().reverse();
    const recentCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const recentDates = dates.filter(d => d >= recentCutoff);
    const olderDates = dates.filter(d => d < recentCutoff);

    recentDates.forEach(date => {
      const items = byDate[date].map(w => `"${w.word}" (${w.meaning})`).join(', ');
      lines.push(`  ${date}: ${items}`);
    });

    if (olderDates.length) {
      lines.push('  Older words (test occasionally):');
      olderDates.forEach(date => {
        const items = byDate[date].map(w => w.word).join(', ');
        lines.push(`  ${date}: ${items}`);
      });
    }
  }

  // Emotional notes
  const notes = getEmotionalNotes();
  if (notes.length) {
    lines.push('\nEmotional notes (handle with discretion — do not bring these up, just be aware):');
    notes.forEach(e => lines.push(`  - ${e.date}: ${e.note}`));
  }

  return lines.join('\n');
}

module.exports = {
  getDb,
  addFrenchWord, getAllFrenchWords, getFrenchWordCount,
  addSession, getSessionCount, getLastSessionDate,
  addEmotionalNote, getEmotionalNotes,
  upsertInterest, getAllInterests,
  getProfile, setProfile,
  mergeExtracted,
  buildMemoryInjection
};
