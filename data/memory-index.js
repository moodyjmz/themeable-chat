const { LocalIndex } = require('vectra');
const path = require('path');
const { embed } = require('./embeddings');

const INDEX_PATH = path.join(__dirname, 'memory_index');
let index = null;

async function getIndex() {
  if (index) return index;
  index = new LocalIndex(INDEX_PATH);
  if (!await index.isIndexCreated()) {
    await index.createIndex();
  }
  return index;
}

async function addFact(text, metadata) {
  const idx = await getIndex();
  const vector = await embed(text);

  // Check for semantic duplicates
  const results = await idx.queryItems(vector, 1);
  if (results.length > 0 && results[0].score > 0.85) {
    return { added: false, existing: results[0].item.metadata.text };
  }

  await idx.insertItem({ vector, metadata: { text, ...metadata } });
  return { added: true };
}

async function queryFacts(text, topK = 15) {
  const idx = await getIndex();
  const vector = await embed(text);
  const results = await idx.queryItems(vector, topK);
  return results.slice(0, topK).map(r => ({
    text: r.item.metadata.text,
    category: r.item.metadata.category,
    date: r.item.metadata.date,
    score: r.score
  }));
}

async function queryFactsMulti(texts, topK = 20) {
  const idx = await getIndex();
  const seen = new Map(); // text -> best score

  for (const text of texts) {
    const vector = await embed(text);
    const results = await idx.queryItems(vector, topK);
    for (const r of results) {
      const key = r.item.metadata.text;
      const existing = seen.get(key);
      if (!existing || r.score > existing.score) {
        seen.set(key, {
          text: key,
          category: r.item.metadata.category,
          date: r.item.metadata.date,
          score: r.score
        });
      }
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

async function listFactsByCategory(category) {
  const idx = await getIndex();
  return idx.listItemsByMetadata({ category: { '$eq': category } });
}

module.exports = { getIndex, addFact, queryFacts, queryFactsMulti, listFactsByCategory };
