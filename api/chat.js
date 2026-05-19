export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel environment variables' });

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  
  const userText = messages
    .filter(m => m.role === 'user')
    .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
    .join('\n');

  if (!userText) return res.status(400).json({ error: 'No message content provided' });

  const models = [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-8b',
    'gemini-pro'
  ];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
        })
      });
      const data = await response.json();
      console.log(`Model ${model}: status ${response.status}`);
      if (response.ok) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return res.status(200).json({ content: [{ type: 'text', text }] });
      }
      const errCode = data.error?.code || response.status;
      const errMsg = data.error?.message || 'Unknown error';
      if (errCode === 404 || errMsg.includes('not found') || errMsg.includes('NOT_FOUND')) continue;
      return res.status(200).json({ error: `API error with model ${model}: ${errMsg}`, code: errCode });
    } catch (err) {
      continue;
    }
  }
  return res.status(200).json({ error: 'No Gemini models available for this API key. Please check your GEMINI_API_KEY in Vercel settings.' });
}
