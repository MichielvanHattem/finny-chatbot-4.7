
import express              from 'express';
import path                 from 'path';
import { fileURLToPath }    from 'url';
import cookieParser         from 'cookie-parser';
import axios                from 'axios';
import { ConfidentialClientApplication } from '@azure/msal-node';
import authMiddleware       from './middleware/authMiddleware.js';
import spFilesRoute         from './routes/sp-files.js';
import dotenv               from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- MSAL ----------
const msal = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET
  }
});

// ---------- ROUTES ----------
app.get('/', (_ ,res) => res.sendFile(path.join(__dirname,'public','index.html')));

app.get('/auth/login', async (_ ,res) => {
  const url = await msal.getAuthCodeUrl({
    scopes: ['Files.Read.All','Sites.Read.All','User.Read'],
    redirectUri: process.env.AZURE_REDIRECT_URI
  });
  res.redirect(url);
});

app.get('/auth/redirect', async (req,res) => {
  const token = await msal.acquireTokenByCode({
    code: req.query.code,
    scopes: ['Files.Read.All','Sites.Read.All','User.Read'],
    redirectUri: process.env.AZURE_REDIRECT_URI
  });
  res.cookie('auth_token', token.accessToken, { httpOnly:true, secure:true });
  res.redirect('/');
});

// SharePoint
app.use('/sp/files', authMiddleware, spFilesRoute);

// Chat-API OpenAI standaard
app.post('/api/chat', async (req,res) => {
  const vraag = (req.body.vraag||'').trim();
  if(!vraag) return res.status(400).json({error:'Lege vraag'});

  try {
    const ai = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role:'system', content:'Je bent Finny, financieel adviseur.' },
          { role:'user',   content: vraag }
        ],
        temperature: 0.3
      },
      { headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    res.json({ antwoord: ai.data.choices[0].message.content.trim() });
  } catch(e){
    console.error(e.response?.data||e.message);
    res.status(500).json({ error:'Chatserver-fout' });
  }
});

// Chat-API FiniMini (Azure)
app.post("/api/finiMini", async (req, res) => {
  const vraag = req.body.vraag;

  try {
    const response = await axios.post(
      process.env.AZURE_ENDPOINT,
      {
        messages: [
          {
            role: "system",
            content: "Je bent Finny, de financieel assistent van ZFG Finance. Beperk antwoorden tot je data."
          },
          {
            role: "user",
            content: vraag
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.AZURE_KEY
        }
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error("Fout bij aanroepen Azure OpenAI:", err.message);
    res.status(500).send("Fout bij ophalen van antwoord.");
  }
});

// Frontend pagina
app.get('/chat', (_ ,res)=>
  res.sendFile(path.join(__dirname,'public','chat.html')));

app.listen(process.env.PORT||3000, () =>
  console.log('Finny 4.7 live op poort',process.env.PORT||3000));
