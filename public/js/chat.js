// public/js/chat.js
(() => {
  const vraagEl = document.getElementById('vraag');
  const btn     = document.getElementById('verzend');
  const out     = document.getElementById('antwoord');

  const BUSY_TEXT = '⏳ bezig…';
  const NET_ERR   = '❌ netwerkfout';

  // Helper: POST JSON with timeout
  async function postJSON(url, body, timeoutMs = 25000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        signal: ctrl.signal
      });
      // try to parse json; if not ok, throw readable error
      let data;
      try { data = await r.json(); }
      catch { throw new Error(`Non-JSON response (${r.status})`); }
      if (!r.ok) {
        const msg = (data && (data.error || data.message)) || `HTTP ${r.status}`;
        throw new Error(msg);
      }
      return data;
    } finally {
      clearTimeout(t);
    }
  }

  function setBusy(busy) {
    vraagEl.disabled = busy;
    btn.disabled = busy;
    btn.textContent = busy ? 'Bezig…' : 'Verstuur';
  }

  function renderAnswer(obj) {
    // Toon alleen de tekst + optionele fileNote
    const base = (obj && (obj.antwoord || obj.content || obj.text || obj.message)) || '';
    const note = obj && obj.fileNote ? `\n\n[i] ${obj.fileNote}` : '';
    out.textContent = (base || '(leeg)') + note;
  }

  async function handleAsk() {
    const vraag = (vraagEl.value || '').trim();
    if (!vraag) { out.textContent = ''; return; }

    out.textContent = BUSY_TEXT;
    setBusy(true);

    try {
      // 1) Router: geeft óf {antwoord} terug, óf {type,hint}
      const j1 = await postJSON('/api/chat', { vraag });

      if (j1 && j1.antwoord) {
        renderAnswer(j1);
        return;
      }

      // 2) Mini: echt antwoord op basis van router-payload
      const payload = { vraag, type: j1?.type, hint: j1?.hint };
      const j2 = await postJSON('/api/finiMini', payload);
      renderAnswer(j2);
    } catch (e) {
      out.textContent = `${NET_ERR}${e?.message ? ` – ${e.message}` : ''}`;
    } finally {
      setBusy(false);
    }
  }

  // Klik + Enter-ondersteuning
  btn.addEventListener('click', handleAsk);
  vraagEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAsk(); }
  });
})();
