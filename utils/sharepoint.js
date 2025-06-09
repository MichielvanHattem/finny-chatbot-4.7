import axios from 'axios';
export async function getSharePointFiles(token){
  const { data } = await axios.get(process.env.GRAPH_API_URL,{
    headers:{ Authorization:`Bearer ${token}` }
  });
  return data;
}
