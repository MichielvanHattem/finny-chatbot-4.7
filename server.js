/**************************************************************************
 * Finny Chatbot 4.7 – Router versie 22-06-2025                           *
 * Klantkant (Prompt 9.3)  →  Finny_mini (Prompt 9.6)                     *
 **************************************************************************/

import express              from 'express';
import path                 from 'path';
import { fileURLToPath }    from 'url';
import cookieParser         from 'cookie-parser';
import axios                from 'axios';
import fs                   from 'fs';
import { ConfidentialClientApplication } from '@azure/msal-node';
import authMiddleware       from './middleware/authMiddleware.js';
import spFilesRoute         from './routes/sp-files.js';
import dotenv               from 'dotenv';
dotenv.config();

/* ---------- BASIS ---------- */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app   = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname,'public')));

/* ---------- PROMPTS & CONFIG ---------- */
const CHAT_PROMPT = fs.readFileSync(
  path.join(__dirname,'prompts','prompt_finny_chatbot.txt'),
  'utf-8'
);

const CONFIG      = JSON.parse(
  fs.readFileSync(path.join(__dirname,'config','bestanden.json'),'utf-8')
);

/* ---------- HULPFUNCTIES ---------- */
function detectType(vraag){
  if(/rgs|code/i.test(vraag))      return 'csv';
  if(/transact/i.test(vraag))      return 'xml';
  return 'pdf';
}

function bepaalBestand(vraag){
  const type = detectType(vraag);
  if(type === 'csv') return CONFIG.csv;
  if(type === 'xml') return CONFIG.xml;

  // Voor pdf proberen jaartal uit vraag te halen
  const match = vraag.match(/20\d{2}/);
  if(match && CONFIG.pdf[match[0]]) return CONFIG.pdf[match[0]];
  // fallback:  meest recente jaarrekening
  return CONFIG.pdf['2024'];
}

/* ---------- MSAL (login + bestandenlijst) ---------- */
const msal = new ConfidentialClientApplication({
  auth:{
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

/* ---------- BACK-UP ROUTE (interne GPT) ---------- */
app.post('/api/chat', async (req,res)=>{
  const vraag = (req.body.vraag||'').trim();
  if(!vraag) return res.status(400).json({error:'Lege vraag'});
  try{
    const gpt = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model:'gpt-3.5-turbo',
        messages:[
          {role:'system',content:CHAT_PROMPT},
          {role:'user',  content:vraag}
        ],
        temperature:0.3
      },
      {headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}}
    );
    res.json({antwoord:gpt.data.choices[0].message.content.trim()});
  }catch(e){
    console.error(e.response?.data||e.message);
    res.status(500).json({error:'Chatserver-fout'});
  }
});

/* ---------- PRIMAIRE ROUTE  →  FINNY_MINI ---------- */
app.post('/api/finiMini', async (req,res)=>{
  const vraagTxt = (req.body.vraag||'').trim();
  if(!vraagTxt) return res.status(400).json({error:'Lege vraag'});

  const payload = {
    vraag:vraagTxt,
    type: detectType(vraagTxt),
    hint: bepaalBestand(vraagTxt)
  };

  try{
    const mini = await axios.post(
      process.env.AZURE_ENDPOINT,
      {
        messages:[
          {role:'system',content:fs.readFileSync(
              path.join(__dirname,'prompts','prompt_finny_mini.txt'),'utf-8')},
          {role:'user',content:JSON.stringify(payload)}
        ],
        temperature:0.2,
        max_tokens: 800
      },
      {headers:{
        'Content-Type':'application/json',
        'api-key':process.env.AZURE_KEY
      }}
    );
    res.json(mini.data);
  }catch(err){
    console.error('Azure-fout:',err.response?.data||err.message);
    res.status(500).json({error:'Fout bij ophalen antwoord Finny_mini'});
  }
});

/* ---------- CHAT-FRONTEND ---------- */
app.get('/chat', (_ ,res)=>
  res.sendFile(path.join(__dirname,'public','chat.html')));

app.listen(process.env.PORT||3000,()=>
  console.log('Finny 4.7 live op poort',process.env.PORT||3000));
