// utils/sharepoint.js
import axios from 'axios';

// GRAPH_API_URL: bv. https://graph.microsoft.com/v1.0/me/drive/root/children
export async function getSharePointFiles(token){
  const url = process.env.GRAPH_API_URL;
  if (!url) throw new Error('GRAPH_API_URL ontbreekt');
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
}
