import express from 'express';
import { getSharePointFiles } from '../utils/sharepoint.js';
const router = express.Router();

// JSON
router.get('/', async (req,res)=>{
  try{ res.json(await getSharePointFiles(req.token)); }
  catch(e){ res.status(500).json({error:'Graph-fout'}); }
});

// HTML
router.get('/html', async (req,res)=>{
  try{
    const files = await getSharePointFiles(req.token);
    const rows = (files.value||[]).map(f=>`
      <tr><td>${f.name}</td><td style="text-align:right">
      ${(f.size/1024).toFixed(1)} kB</td>
      <td><a href="${f['@microsoft.graph.downloadUrl']}" target="_blank">download</a></td></tr>`).join('');

    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Bestanden</title>
      <style>body{font-family:Arial;padding:30px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:8px}</style></head><body>
      <h2>Bestanden</h2><table>
      <tr><th>Naam</th><th style="text-align:right">Grootte</th><th>Actie</th></tr>${rows}</table></body></html>`);
  }catch(e){ res.status(500).send('Graph-fout'); }
});

export default router;
