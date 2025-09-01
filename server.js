/**************************************************************************
 * Finny Chatbot 4.7.1 – Patch (Prompt 9.9, betere /api/chat)
 * Behóudt login + /sp/files. Geeft normale tekst-antwoord via OpenAI.
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
app.use(express.urlencoded({ extended: true })); // belangrijk voor form posts
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
  if (/transact/i.test(vraag))      return 'xml';
  return 'pdf';
}
function bepaalBestand(vraag) {
  const type = detectType(vraag);
  if (type === 'csv') return CONFIG.csv || 'omzet_2023.csv';
  if (type === 'xml') return CONFIG.xml || 'GLTransactions_1.xml';
  const match = vraag.match(/20\d{2}/);
  if (match && CONFIG.pdf?.[match[0]]) return CONFIG.pdf[match[0]];
  return CONFIG.pdf?.['2024'] || 'Jaarrekening_2024.pdf';
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

/* ---------- /api/chat → echte beantwoording via OpenAI ---------- */
app.post('/api/chat', async (req,res)=>{
  try{
    const vraag = (req.body.vraag || req.body.q || '').trim();
    if(!vraag) return res.status(400).json({ error:'Lege vraag' });

    const key   = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if(!key){
      // nette fallback (geen key)
      const type = detectType(vraag);
      const hint = bepaalBestand(vraag);
      return res
        .status(200)
        .type('text/plain')
        .send(`(stub) Geen OPENAI_API_KEY. Router: ${type}${hint?(' '+hint):''}`);
    }

    const payload = {
      model,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role:'system', content: promptInfo.ok ? promptInfo.text : '' },
        { role:'user',   content: vraag }
      ]
    };

    const rsp = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
      headers: { 'Content-Type':'application/json', Authorization: `Bearer ${key}` }
    });

    const answer = rsp?.data?.choices?.[0]?.message?.content?.trim() || '';
    return res.type('text/plain').send(answer || '(leeg)');
  }catch(e){
    console.error('OpenAI fout:', e.response?.data || e.message);
    // vriendelijke fallback
    const vraag = (req.body.vraag || req.body.q || '').toLowerCase();
    const router = /omzet/.test(vraag) ? { type:'pdf', hint:'jaarrekening_2023' }
                 : /2022/.test(vraag)  ? { type:'csv', hint:'omzet_2022.csv' }
                 : { type:'unknown', hint:null };
    return res.status(200).type('text/plain').send(`(fallback) router: ${router.type} ${router.hint||''}`);
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
      process.env.AZURE_ENDPOINT, // verwacht volledige chat-completions URL
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
