/* ─── Éleonore — shared French speech ───────────────────────────────────────
   Exposes two globals:
     speakFrench(text, el)  — speak text in French, toggle if already speaking
     highlightFrench(el)    — scan an element for French, wrap spans, wire clicks
   ─────────────────────────────────────────────────────────────────────────── */

(function () {
  let current = null; // { utterance, el }
  let frenchVoice = null;

  // ── Voice loading ──────────────────────────────────────────────────────────
  // Voices load asynchronously in most browsers — cache once available

  function loadVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    // Preferred voices in order — warm, natural French female
    const preferred = ['Amélie', 'Flo (French (France))', 'Grandma (French (France))', 'Thomas', 'Jacques'];
    for (const name of preferred) {
      const v = voices.find(v => v.name === name);
      if (v) { frenchVoice = v; return; }
    }
    // Fallback — any fr-FR, then any fr-*
    frenchVoice = voices.find(v => v.lang === 'fr-FR') ||
        voices.find(v => v.lang.startsWith('fr')) ||
        null;
  }

  loadVoice();
  window.speechSynthesis.onvoiceschanged = loadVoice;
  // Some browsers need a tick before voices are available
  setTimeout(loadVoice, 100);

  // ── Core speak function ────────────────────────────────────────────────────

  window.speakFrench = function (text, el) {
    // If already speaking this element — cancel and stop
    if (current) {
      window.speechSynthesis.cancel();
      if (current.el) current.el.classList.remove('speaking');
      const wasEl = current.el;
      current = null;
      if (wasEl === el) return; // toggle off
    }

    // Retry voice loading if still null
    if (!frenchVoice) loadVoice();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'fr-FR';
    utter.rate = 0.85;
    utter.pitch = 1.05;
    if (frenchVoice) utter.voice = frenchVoice;

    if (el) el.classList.add('speaking');

    utter.onend = () => {
      if (el) el.classList.remove('speaking');
      current = null;
    };
    utter.onerror = () => {
      if (el) el.classList.remove('speaking');
      current = null;
    };

    current = { utterance: utter, el };
    window.speechSynthesis.speak(utter);
  };

  // ── Highlight French spans in a message bubble ────────────────────────────
  // Éleonore wraps French words/phrases in &&double ampersands&& — we parse
  // those markers rather than trying to detect French linguistically.
  // Single *asterisks* are used for actions/stage directions (rendered as <em>).

  window.highlightFrench = function (bubble) {
    if (!bubble) return;

    const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    nodes.forEach(textNode => {
      const text = textNode.nodeValue;
      if (!text.includes('&&')) return;

      // Split on &&phrase&& markers, preserving the phrases
      const parts = text.split(/(&&[^&]+&&)/);
      if (parts.length <= 1) return;

      const frag = document.createDocumentFragment();
      parts.forEach(part => {
        if (part.startsWith('&&') && part.endsWith('&&') && part.length > 4) {
          const word = part.slice(2, -2); // strip &&
          const span = document.createElement('span');
          span.className = 'french-word';
          span.textContent = word;
          span.title = 'Cliquer pour entendre';
          span.addEventListener('click', () => window.speakFrench(word, span));
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      });

      textNode.parentNode.replaceChild(frag, textNode);
    });
  };

})();
