// ─── Session save/load ──────────────────────────────────────────────────────

let lastExtractedLength = 0;
let lastExtractionTime = 0;
const EXTRACTION_COOLDOWN = 5 * 60 * 1000; // 5 minutes between extractions
const MIN_NEW_MESSAGES = 4; // need at least 2 exchanges (user+assistant each)

function resetExtraction() {
  lastExtractedLength = 0;
}

function getNewMessages(messages) {
  if (messages.length <= lastExtractedLength) return null;

  const newCount = messages.length - lastExtractedLength;
  if (newCount < MIN_NEW_MESSAGES) return null;

  const now = Date.now();
  if (now - lastExtractionTime < EXTRACTION_COOLDOWN) return null;

  const newMessages = messages.slice(lastExtractedLength);
  lastExtractedLength = messages.length;
  lastExtractionTime = now;
  return newMessages;
}

module.exports = { resetExtraction, getNewMessages };
