document.getElementById('verzend').addEventListener('click', async () => {
  const vraag = document.getElementById('vraag').value.trim();
  const out   = document.getElementById('antwoord');
  if(!vraag){ out.textContent=''; return; }
  out.textContent = '⏳ bezig…';
  try {
    // 1) Router: /api/chat -> {type,hint} OF {antwoord}
    const r1 = await fetch('/api/chat',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ vraag })
    });
    const j1 = await r1.json();
    if (j1.antwoord) { out.textContent = j1.antwoord; return; }

    const payload = { vraag, type:j1.type, hint:j1.hint };
    // 2) Mini: /api/finiMini -> echt antwoord
    const r2 = await fetch('/api/finiMini',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const j2 = await r2.json();
    out.textContent = j2.antwoord || j2.content || JSON.stringify(j2,null,2);
  } catch(e){ out.textContent = '❌ netwerkfout'; }
});
