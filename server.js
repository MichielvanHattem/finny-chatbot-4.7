/**************************************************************************
 * Finny Chatbot 4.7.1 – Patch (Prompt 9.9 + file context + betere /api/chat)
 * - Behóudt login + /sp/files
 * - /api/chat geeft JSON { antwoord } (UI blijft werken)
 * - Leest (indien ingelogd) het juiste bestand uit Graph en voegt het
 *   als context toe aan de OpenAI-call (CSV/XML als tekst; PDF best-effort)
 **************************************************************************/

import express                   from 'express';
import path                      from 'path';
import { fileURLToPath }         from 'url';
import cookieParser              from 'cookie-parser';
import axios                     from 'axios';
import fs                        from 'fs';
import crypto                    from 'crypto';
import { ConfidentialClientApplication } from '@azure/msal-node';
import authMiddleware            from './middleware/authMiddleware.js';
import spFilesRoute              from './routes/sp-files.js';
import dotenv                    from 'dotenv';
dotenv.config();

/* ---------- BASIS ---------- */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));     // form posts
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- PROMPT LOADER (9.9) + DEBUG ---------- */
const PROMPT_FILE = process.env.PROMPT_FILE
  || path.join(__dirname, 'prompts', 'prompt_finny_mini.txt');

function readPromptSafe(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
    return { ok: true, text, hash, file };
  } catch (e) {
    return { ok: false, error: e.message, file };
  }
}
let promptInfo = readPromptSafe(PROMPT_FILE);

/* ---------- CONFIG (optioneel) ---------- */
let CONFIG = { csv: null, xml: null, pdf: {} };
try {
  const cfgPath = path.join(__dirname, 'config', 'bestanden.json');
  if (fs.existsSync(cfgPath)) CONFIG = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
} catch (e) {
  console.warn('CONFIG niet geladen:', e.message);
}

/* ---------- HULPFUNCTIES ---------- */
function detectType(vraag) {
  if (/rgs|code/i.test(vraag))      return 'csv';
  if (/transact|xaf|audit/i.test(vraag)) return 'xml';
  return 'pdf';
}
function bepaalBestand(vraag) {
  const type = detectType(vraag);
  if (type === 'csv') return CONFIG.csv || null;
  if (type === 'xml') return CONFIG.xml || 'GLTransactions_1.xml';
  const match = vraag.match(/20\d{2}/);
  if (match && CONFIG.pdf?.[match[0]]) return CONFIG.pdf[match[0]];
  return CONFIG.pdf?.['2024'] || 'Jaarrekening_2024.pdf';
}

/* ---------- GRAPH HELPERS (bestandscontext) ---------- */
// Lijst-URL (bv. …/me/drive/root/children) -> drive-basis (…/me/drive of …/sites/.../drives/...)
function graphBaseFrom(url) {
  const fallback = 'https://graph.microsoft.com/v1.0/me/drive';
  if (!url) return fallback;
  const m = url.match(/^(.*?\/v1\.0\/(?:me\/drive|sites\/[^/]+\/drives\/[^/]+))/i);
  return (m && m[1]) || fallback;
}
const GRAPH_LIST = process.env.GRAPH_API_URL || 'https://graph.microsoft.com/v1.0/me/drive/root/children';
const GRAPH_BASE = graphBaseFrom(GRAPH_LIST);

async function graphSearch(token, query, top = 10) {
  const q = encodeURIComponent(query);
  const url = `${GRAPH_BASE}/root/search(q='${q}')?$top=${top}&select=id,name,size,webUrl`;
  const r = await axios.get(url, { headers:{ Authorization:`Bearer ${token}` }});
  return r.data?.value || [];
}
async function findItemByName(token, name) {
  const hits = await graphSearch(token, name, 5);
  return hits.find(h => h.name === name) || hits[0] || null;
}
async function findLikelyReport(token, year) {
  const queries = [
    `Jaarrekening ${year}`,
    `Jaarstukken ${year}`,
    `${year}`,
    `Jaarrekening`,
    `Jaarstukken`
  ];
  for (const q of queries) {
    const hits = await graphSearch(token, q, 20);
    const pdfYear = hits.find(h => h.name?.toLowerCase().endsWith('.pdf') && String(h.name).includes(String(year)));
    if (pdfYear) return pdfYear;
    const anyPdf = hits.find(h => h.name?.toLowerCase().endsWith('.pdf'));
    if (anyPdf) return anyPdf;
  }
  return null;
}
async function downloadById(token, id) {
  const url = `${GRAPH_BASE}/items/${id}/content`;
  const r = await axios.get(url, {
    headers:{ Authorization:`Bearer ${token}` },
    responseType:'arraybuffer'
  });
  return Buffer.from(r.data);
}
// csv=UTF-16LE (Finny-standaard), xml=UTF-8, pdf best-effort
function bufferToText(buf, type) {
  try {
    if (type === 'csv') return buf.toString('utf16le');
    if (type === 'xml') return buf.toString('utf8');
    const u = buf.toString('utf8');
    return u.includes('\u0000') ? buf.toString('utf16le') : u;
  } catch { return ''; }
}
function clampChars(s, max = 20000) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + `\n\n[TRUNCATED ${s.length - max} chars]` : s;
}

/* ---------- MSAL (login + bestandenlijst) ---------- */
const msal = new ConfidentialClientApplication({
  auth: {
    clientId:     process.env.AZURE_CLIENT_ID,
    authority:   `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET
  }
});

app.get('/', (_ ,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/auth/login', async (_ ,res)=>{
  const url = await msal.getAuthCodeUrl({
    scopes:['Files.Read.All','Sites.Read.All','User.Read'],
    redirectUri:process.env.AZURE_REDIRECT_URI
  });
  res.redirect(url);
});
app.get('/auth/redirect', async (req,res)=>{
  const token = await msal.acquireTokenByCode({
    code:req.query.code,
    scopes:['Files.Read.All','Sites.Read.All','User.Read'],
    redirectUri:process.env.AZURE_REDIRECT_URI
  });
  res.cookie('auth_token',token.accessToken,{httpOnly:true,secure:true});
  res.redirect('/');
});
app.use('/sp/files', authMiddleware, spFilesRoute);

/* ---------- HEALTH & PROMPT DEBUG ---------- */
const VERSION = '4.7.1';
const COMMIT  = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local';

app.get('/health', (_req,res)=>res.json({
  ok:true,
  version: VERSION,
  commit: COMMIT,
  prompt: { ok: promptInfo.ok, file: promptInfo.file, hash: promptInfo.ok ? promptInfo.hash : null, length: promptInfo.ok ? promptInfo.text.length : 0 },
  ts: new Date().toISOString()
}));
app.get('/debug/prompt', (_req,res)=>{
  if(!promptInfo.ok) return res.status(500).json(promptInfo);
  res.json({ file: promptInfo.file, hash: promptInfo.hash, preview: promptInfo.text.slice(0,400) });
});

/* ---------- /api/chat → OpenAI + JSON response + FILE CONTEXT ---------- */
app.post('/api/chat', async (req, res) => {
  const vraag = (req.body?.vraag || req.body?.q || '').trim();
  if (!vraag) return res.status(400).json({ error: 'Lege vraag' });

  const sys   = promptInfo.ok ? promptInfo.text : '';
  const key   = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  // Router (welke file lijkt logisch?)
  const fType = detectType(vraag);
  const fName = bepaalBestand(vraag);

  // Probeer context uit Graph te halen (alleen als ingelogd)
  let context = '';
  let fileNote = '';
  const token = req.cookies?.auth_token;

  if (token) {
    try {
      const baseName = fName ? path.parse(fName).base : '';
      // 1) exact
      let item = baseName ? await findItemByName(token, baseName) : null;
      // 2) fuzzy (Jaarrekening/Jaarstukken + jaartal)
      if (!item) {
        const yearFromQ    = (vraag.match(/20\d{2}/) || [])[0];
        const yearFromHint = (baseName.match(/20\d{2}/) || [])[0];
        const year = yearFromQ || yearFromHint || new Date().getFullYear();
        item = await findLikelyReport(token, year);
      }
      if (item?.id) {
        const bin = await downloadById(token, item.id);
        const raw = bufferToText(bin, fType);
        if (raw) { context = clampChars(raw, 20000); fileNote = `Bestand: ${item.name} (${fType}).`; }
        else     { fileNote = `Bestand ${item.name} gevonden, maar tekstextractie is beperkt.`; }
      } else {
        fileNote = `Geen match in Graph (zoek: ${baseName || 'Jaarrekening/Jaarstukken + jaartal'}).`;
      }
    } catch (e) {
      fileNote = `Graph fout: ${e.response?.status || ''} ${e.response?.statusText || e.message}`;
    }
  } else {
    fileNote = 'Niet ingelogd voor bestandslezing.';
  }

  // Geen key? nette stub
  if (!key) {
    return res.status(200).json({
      antwoord: `(stub) Geen OPENAI_API_KEY. Router: ${fType} ${fName||''}. ${fileNote}`,
      provider: 'stub', version: VERSION, promptHash: promptInfo.ok ? promptInfo.hash : null
    });
  }

  // Bouw berichten met optionele context
  const messages = [
    { role:'system', content: sys },
    ...(context ? [{
      role:'system',
      content:
`Je krijgt context uit een gebruikersbestand. Gebruik het ALLEEN als het relevant is.
[FILE_CONTEXT_BEGIN]
${context}
[FILE_CONTEXT_END]
(Info: ${fileNote})
Beantwoord de vraag beknopt met cijfers waar mogelijk en noem de bron (CSV/XML/PDF).`
    }] : []),
    { role:'user', content: vraag }
  ];

  try {
    const rsp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model, temperature:0.2, max_tokens:800, messages },
      { headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${key}` } }
    );
    const antwoord = rsp?.data?.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({
      antwoord, provider:'openai', version: VERSION,
      promptHash: promptInfo.ok ? promptInfo.hash : null,
      fileNote: fileNote || undefined
    });
  } catch (e) {
    return res.status(200).json({
      antwoord: `(fallback) Model niet bereikbaar. Router: ${fType} ${fName||''}. ${fileNote}`,
      error: e.response?.data || e.message, version: VERSION
    });
  }
});

/* ---------- PRIMAIRE ROUTE  →  FINNY_MINI (optioneel Azure) ---------- */
app.post('/api/finiMini', async (req,res)=>{
  const vraagTxt = (req.body.vraag || req.body.q || '').trim();
  if(!vraagTxt) return res.status(400).json({error:'Lege vraag'});

  const payload = {
    vraag: vraagTxt,
    type:  detectType(vraagTxt),
    hint:  bepaalBestand(vraagTxt)
  };

  try{
    const mini = await axios.post(
      process.env.AZURE_ENDPOINT, // volledige chat-completions URL
      {
        messages:[
          { role:'system', content: promptInfo.ok ? promptInfo.text : '' },
          { role:'user',   content: JSON.stringify(payload) }
        ],
        temperature:0.2,
        max_tokens: 800
      },
      { headers:{
          'Content-Type':'application/json',
          'api-key': process.env.AZURE_KEY
        }
      }
    );
    res.json(mini.data);
  }catch(err){
    console.error('Azure-fout:', err.response?.data || err.message);
    res.status(500).json({error:'Fout bij ophalen antwoord Finny_mini'});
  }
});

/* ---------- CHAT-FRONTEND ---------- */
app.get('/chat', (_ ,res)=>res.sendFile(path.join(__dirname,'public','chat.html')));

/* ---------- START ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{
  console.log(`Finny ${VERSION} live op poort ${PORT} (commit ${COMMIT})`);
  console.log(`PROMPT_FILE=${PROMPT_FILE} -> ${promptInfo.ok ? 'OK #'+promptInfo.hash : 'MISSING: '+promptInfo.error}`);
});
