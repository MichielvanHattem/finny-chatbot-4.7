// routes/sp-files.js
import express from 'express';
import { getSharePointFiles } from '../utils/sharepoint.js';

const router = express.Router();

// JSON-lijst
router.get('/', async (req,res)=>{
  try {
    const data = await getSharePointFiles(req.token);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error:'Graph-fout', detail:e.message });
  }
});

// Eenvoudige HTML-lijst
router.get('/html', async (req,res)=>{
  try {
    const data = await getSharePointFiles(req.token);
    const rows = (data.value || []).map(f => {
      const url = f['@microsoft.graph.downloadUrl'] || f.webUrl || '#';
      const sizeKb = (f.size/1024).toFixed(1);
      return `<tr><td>${f.name}</td><td style="text-align:right">${sizeKb} kB</td><td><a href="${url}" target="_blank">download</a></td></tr>`;
    }).join('');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Bestanden</title>
      <style>body{font-family:system-ui;padding:24px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ddd;padding:8px}th{text-align:left;background:#f6f6f6}</style></head>
      <body><h2>Bestanden</h2><table><tr><th>Naam</th><th style="text-align:right">Grootte</th><th>Actie</th></tr>${rows}</table></body></html>`);
  } catch (e) {
    res.status(500).send('Graph-fout');
  }
});

export default router;
