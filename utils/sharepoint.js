const axios = require('axios');

async function getSharePointFiles(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const { data } = await axios.get(process.env.GRAPH_API_URL, { headers });
  return data;
}

module.exports = { getSharePointFiles };
