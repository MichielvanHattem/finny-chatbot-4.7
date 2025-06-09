document.getElementById('verzend').addEventListener('click', () => {
  const vraag = document.getElementById('vraag').value;
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vraag })
  })
  .then(r => r.json())
  .then(d => { document.getElementById('antwoord').textContent = d.antwoord || d.error; })
  .catch(() => { document.getElementById('antwoord').textContent = 'Serverfout'; });
});
