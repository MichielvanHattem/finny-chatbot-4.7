const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const authMiddleware = require('./middleware/authMiddleware');
const spFilesRoute = require('./routes/sp-files');
require('dotenv').config();
const { ConfidentialClientApplication } = require('@azure/msal-node');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- MSAL (Azure AD) ----------
const msalInstance = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET
  }
});

// ---------- ROUTES ----------

// startpagina
app.get('/', (_, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

// login
app.get('/auth/login', async (_, res) => {
  const url = await msalInstance.getAuthCodeUrl({
    scopes: ['Files.Read.All', 'Sites.Read.All', 'User.Read'],
    redirectUri: process.env.AZURE_REDIRECT_URI
  });
  res.redirect(url);
});

// OAuth-callback
app.get('/auth/redirect', async (req, res) => {
  const tokenResponse = await msalInstance.acquireTokenByCode({
    code: req.query.code,
    scopes: ['Files.Read.All', 'Sites.Read.All', 'User.Read'],
    redirectUri: process.env.AZURE_REDIRECT_URI
  });
  res.cookie('auth_token', tokenResponse.accessToken, { httpOnly: true, secure: true });
  res.redirect('/');
});

// SharePoint-bestanden
app.use('/sp/files', authMiddleware, spFilesRoute);

// Chat-frontend
app.get('/chat', (_, res) =>
  res.sendFile(path.join(__dirname, 'public', 'chat.html')));

// Chat-API
app.post('/api/chat', async (req, res) => {
  try {
    const vraag = req.body.vraag;
    const ai = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: vraag }] },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    res.json({ antwoord: ai.data.choices[0].message.content.trim() });
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).json({ error: 'Chat fout' });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log('Finny 4.7 draait'));
