document.getElementById('verzend').addEventListener('click', async () => {
  const vraag = document.getElementById('vraag').value.trim();
  const out   = document.getElementById('antwoord');
  if(!vraag){ out.textContent='';return; }

  out.textContent='⏳ bezig…';
  try{
    const r = await fetch('/api/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ vraag })
    });
    const j = await r.json();
    out.textContent = j.antwoord || j.error || 'Onbekende fout';
  }catch(e){ out.textContent='❌ netwerkfout'; }
});
