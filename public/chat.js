// ─── Shared chat logic ──────────────────────────────────────────────────────

let conversationHistory = [];
let isLoading = false;
let systemPrompt = '';
let models = {};
let maxTokens = {};
let themeConfig = {};

// Allow external code (user profile toggle) to update the system prompt
window.setSystemPrompt = function(prompt) {
  systemPrompt = prompt;
};

// Save current user's chat, clear DOM, then restore new user's chat
window.switchUserChat = function() {
  // Save current user's conversation before switching
  persistToStorage();
  // Clear DOM and state
  conversationHistory = [];
  displayedMessages = [];
  lastSavedLength = 0;
  isNewConversation = true;
  var chatArea = document.getElementById('chatArea');
  if (chatArea) chatArea.innerHTML = '';
  // New user's storage key will be picked up on next restoreFromStorage call
};

// Hard reset — clears current user's chat entirely
window.resetConversation = function() {
  conversationHistory = [];
  displayedMessages = [];
  lastSavedLength = 0;
  isNewConversation = true;
  localStorage.removeItem(getStorageKey());
  var chatArea = document.getElementById('chatArea');
  if (chatArea) chatArea.innerHTML = '';
};

// Track which messages are displayed (role + type) for restoring from storage
let displayedMessages = [];

const chatArea = document.getElementById('chatArea');
const inputField = document.getElementById('inputField');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');

const parentMode = new URLSearchParams(window.location.search).has('parent');

function getStorageKey() {
  const userId = localStorage.getItem('buchhalter-user') || 'default';
  return 'chat-session-' + userId;
}

// ─── Session storage (survives tab switches) ────────────────────────────────

function persistToStorage() {
  if (parentMode) return;
  localStorage.setItem(getStorageKey(), JSON.stringify({
    history: conversationHistory,
    display: displayedMessages
  }));
}

window.restoreFromStorage = function restoreFromStorage() {
  if (parentMode) return false;
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return false;
    const { history, display } = JSON.parse(raw);
    if (!history || history.length === 0) return false;

    conversationHistory = history;
    displayedMessages = display || [];

    // Re-render messages
    for (const msg of displayedMessages) {
      if (msg.type === 'system') {
        appendSystemMessage(msg.text, true);
      } else {
        appendMessage(msg.role, msg.text, true);
      }
    }

    lastSavedLength = conversationHistory.length;
    isNewConversation = false;
    return true;
  } catch {
    return false;
  }
}

// ─── Load prompt + config from server ───────────────────────────────────────

async function loadPrompt() {
  try {
    const user = localStorage.getItem('buchhalter-user') || '';
    const qs = user ? `?user=${encodeURIComponent(user)}` : '';
    const res = await fetch('/prompt' + qs);
    const data = await res.json();
    systemPrompt = data.systemPrompt;
    models = data.models;
    maxTokens = data.maxTokens;
    themeConfig = data.theme || {};
  } catch {
    console.error('Failed to load prompt from server');
  }
}

// ─── Session saving ─────────────────────────────────────────────────────────

let lastSavedLength = 0;
let isNewConversation = true;

async function saveSession() {
  if (parentMode) return;
  if (conversationHistory.length === 0) return;
  if (conversationHistory.length === lastSavedLength) return;
  try {
    navigator.sendBeacon('/save', JSON.stringify({
      messages: conversationHistory,
      isNew: isNewConversation,
      user: localStorage.getItem('buchhalter-user') || 'unknown'
    }));
    isNewConversation = false;
    lastSavedLength = conversationHistory.length;
  } catch {}
}

setInterval(saveSession, 5 * 60 * 1000);

// Single save handler — pagehide is most reliable, others are fallbacks
let savedOnExit = false;
function saveOnExit() {
  if (savedOnExit) return;
  savedOnExit = true;
  persistToStorage();
  saveSession();
  setTimeout(() => { savedOnExit = false; }, 1000);
}
window.addEventListener('pagehide', saveOnExit);
window.addEventListener('beforeunload', saveOnExit);

// Intercept all link clicks to persist before navigation
document.addEventListener('click', function(e) {
  var link = e.target.closest('a');
  if (link && link.href && !link.target) {
    persistToStorage();
  }
});

// Restore previous session or start fresh
loadPrompt().then(() => {
  restoreFromStorage();
});

if (parentMode) {
  const subtitle = document.querySelector('.subtitle');
  if (subtitle) {
    subtitle.textContent = 'Parent mode — nothing is saved';
    subtitle.style.opacity = '0.5';
  }
}

// ─── Input handling ─────────────────────────────────────────────────────────

inputField.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

inputField.addEventListener('input', () => {
  inputField.style.height = 'auto';
  inputField.style.height = Math.min(inputField.scrollHeight, 140) + 'px';
});

sendBtn.addEventListener('click', sendMessage);

// ─── File upload ────────────────────────────────────────────────────────────

if (fileInput) {
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.value = '';

    appendSystemMessage(`Datei wird hochgeladen: ${file.name}...`);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.error) {
        appendSystemMessage(`Fehler: ${data.error}`);
        return;
      }

      const previewText = data.preview.length > 500
        ? data.preview.substring(0, 500) + '\n...[gekürzt]'
        : data.preview;
      appendSystemMessage(`📎 ${data.fileName} (${data.fileType})\n${previewText}`);

      conversationHistory.push({
        role: 'user',
        content: `[Datei hochgeladen: ${data.fileName} (${data.fileType})]\n\nInhalt/Vorschau:\n${data.preview}`
      });

      persistToStorage();

    } catch (err) {
      appendSystemMessage('Upload fehlgeschlagen: ' + err.message);
    }
  });
}

// ─── Message rendering ──────────────────────────────────────────────────────

function appendMessage(role, text, isRestore) {
  const div = document.createElement('div');
  div.className = `message ${role}`;

  const label = document.createElement('div');
  label.className = 'message-label';
  const assistantName = document.body.dataset.assistantName || 'Assistant';
  const userName = document.body.dataset.userName || 'You';
  label.textContent = role === 'user' ? userName : assistantName;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = typeof marked !== 'undefined' && marked.parse
    ? marked.parse(text)
    : text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  if (role === 'assistant' && window.highlightFrench) {
    requestAnimationFrame(() => window.highlightFrench(bubble));
  }

  // Skip animation on restore
  if (isRestore) div.style.animation = 'none';

  div.appendChild(label);
  div.appendChild(bubble);
  chatArea.appendChild(div);

  if (!isRestore) {
    div.scrollIntoView({ behavior: 'smooth', block: 'end' });
    displayedMessages.push({ role, text, type: 'message' });
    persistToStorage();
  }
}

function appendSystemMessage(text, isRestore) {
  const div = document.createElement('div');
  div.className = 'message system';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.style.whiteSpace = 'pre-wrap';
  bubble.textContent = text;

  if (isRestore) div.style.animation = 'none';

  div.appendChild(bubble);
  chatArea.appendChild(div);

  if (!isRestore) {
    div.scrollIntoView({ behavior: 'smooth', block: 'end' });
    displayedMessages.push({ text, type: 'system' });
    persistToStorage();
  }
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typingIndicator';

  const label = document.createElement('div');
  label.className = 'typing-label';
  label.textContent = document.body.dataset.assistantName || 'Assistant';

  const bubble = document.createElement('div');
  bubble.className = 'typing-bubble';
  bubble.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

  div.appendChild(label);
  div.appendChild(bubble);
  chatArea.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function hideTyping() {
  const t = document.getElementById('typingIndicator');
  if (t) t.remove();
}

// ─── Send message ───────────────────────────────────────────────────────────

async function sendMessage() {
  const text = inputField.value.trim();
  if (!text || isLoading || !systemPrompt) return;

  inputField.value = '';
  inputField.style.height = 'auto';
  isLoading = true;
  sendBtn.disabled = true;

  appendMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });

  showTyping();

  try {
    // Send last 20 messages to API (sliding window to limit tokens)
    const MAX_CONTEXT_MESSAGES = 20;
    const contextMessages = conversationHistory.length > MAX_CONTEXT_MESSAGES
      ? conversationHistory.slice(-MAX_CONTEXT_MESSAGES)
      : conversationHistory;

    const response = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: models.chat,
        max_tokens: maxTokens.chat,
        system: systemPrompt,
        messages: contextMessages
      })
    });

    const data = await response.json();
    hideTyping();

    const fallback = themeConfig.id === 'buchhalter'
      ? 'Entschuldigung — es gab ein technisches Problem. Bitte versuchen Sie es erneut.'
      : "Ah, pardonnez-moi — something seems to have gone wrong. Try again, chérie.";

    const reply = data.content?.[0]?.text || fallback;
    conversationHistory.push({ role: 'assistant', content: reply });
    appendMessage('assistant', reply);

    if (!parentMode && conversationHistory.length % 5 === 0) saveSession();

  } catch (err) {
    hideTyping();
    const errorMsg = themeConfig.id === 'buchhalter'
      ? 'Verbindungsfehler. Bitte versuchen Sie es erneut.'
      : "Mon dieu — something has gone wrong with my connection. Please try again.";
    appendMessage('assistant', errorMsg);
  }

  isLoading = false;
  sendBtn.disabled = false;
  inputField.focus();
}
