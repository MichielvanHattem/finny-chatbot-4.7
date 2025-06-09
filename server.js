const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const authMiddleware = require('./middleware/authMiddleware');
const spFilesRoute = require('./routes/sp-files');
require('dotenv').config();
const { ConfidentialClientApplication } = require('@azure/msal-node');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
};
const msalInstance = new ConfidentialClientApplication(msalConfig);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/auth/login', async (req, res) => {
  const authUrl = await msalInstance.getAuthCodeUrl({
    scopes: ["Files.Read.All", "Sites.Read.All", "User.Read"],
    redirectUri: process.env.AZURE_REDIRECT_URI,
  });
  res.redirect(authUrl);
});

app.get('/auth/redirect', async (req, res) => {
  const response = await msalInstance.acquireTokenByCode({
    code: req.query.code,
    scopes: ["Files.Read.All", "Sites.Read.All", "User.Read"],
    redirectUri: process.env.AZURE_REDIRECT_URI,
  });
  res.cookie('auth_token', response.accessToken, { httpOnly: true, secure: true });
  res.redirect('/');
});

app.use('/sp/files', authMiddleware, spFilesRoute);
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

app.listen(process.env.PORT || 3000, () => console.log('Server gestart'));