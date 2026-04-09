// ─── Shared memory extraction + injection logic ────────────────────────────
// Theme-specific extraction/injection is handled by calling theme hooks.
// This module provides the orchestration.

const { callClaude } = require('./api-proxy');

async function extractMemory(apiKey, model, maxTokens, extractionPrompt, transcript) {
  const raw = await callClaude(
    apiKey, model, maxTokens, extractionPrompt,
    [{ role: 'user', content: `Extract memory from this conversation:\n\n${transcript}` }]
  );

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    console.error('Memory extraction parse failed:', raw);
    return null;
  }
}

module.exports = { extractMemory };
