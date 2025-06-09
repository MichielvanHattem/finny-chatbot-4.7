document.getElementById('verzend').onclick = () => {
  fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vraag: document.getElementById('vraag').value }) })
    .then(r => r.json()).then(d => document.getElementById('antwoord').textContent = d.antwoord);
};