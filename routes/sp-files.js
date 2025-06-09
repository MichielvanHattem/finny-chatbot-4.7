const express = require('express');
const router  = express.Router();
const { getSharePointFiles } = require('../utils/sharepoint');

// JSON
router.get('/', async (req, res) => {
  try {
    const files = await getSharePointFiles(req.token);
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: 'Fout bij ophalen bestanden' });
  }
});

// HTML
router.get('/html', async (req, res) => {
  try {
    const files = await getSharePointFiles(req.token);
    const rows = (files.value || []).map(f => `
      <tr>
        <td>${f.name}</td>
        <td style="text-align:right">${(f.size/1024).toFixed(1)} kB</td>
        <td><a href="${f['@microsoft.graph.downloadUrl']}" target="_blank">download</a></td>
      </tr>`).join('');
    res.send(`<!DOCTYPE html><html><head>
      <title>Bestanden</title><meta charset="utf-8">
      <style>body{font-family:Arial;padding:30px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px}</style>
      </head><body><h2>Bestanden</h2>
      <table><tr><th>Naam</th><th style="text-align:right">Grootte</th><th>Actie</th></tr>${rows}</table>
      </body></html>`);
  } catch (e) {
    res.status(500).send('Fout bij ophalen bestanden');
  }
});

module.exports = router;
