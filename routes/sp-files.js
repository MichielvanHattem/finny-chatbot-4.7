const express = require('express');
const router = express.Router();
const { getSharePointFiles } = require('../utils/sharepoint');

router.get('/', async (req, res) => {
  const files = await getSharePointFiles(req.token);
  res.json(files);
});

module.exports = router;