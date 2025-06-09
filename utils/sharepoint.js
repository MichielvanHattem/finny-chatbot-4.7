const axios = require('axios');

async function getSharePointFiles(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const response = await axios.get(process.env.GRAPH_API_URL, { headers });
  return response.data;
}

module.exports = { getSharePointFiles };