export const config = { api: { bodyParser: true } };

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const userText = messages
    .filter(m => m.role === 'user')
    .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
    .join('\n');

  if (!userText) return res.status(400).json({ error: 'No message provided' });

  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-8b',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash'
  ];

  const enhancedPrompt = userText + '\n\nCRITICAL: Return ONLY a raw JSON array. No markdown, no backticks, no explanation. Start your response with [ and end with ]';

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2000,
            responseMimeType: 'application/json'
          }
        })
      });

      const data = await response.json();
      console.log(`Model ${model}: ${response.status}`);

      if (response.ok) {
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const jsonStart = text.indexOf('[');
        if (jsonStart > 0) text = text.substring(jsonStart);
        return res.status(200).json({ content: [{ type: 'text', text }] });
      }

      const errCode = data.error?.code || response.status;
      const errMsg = data.error?.message || '';
      if (errCode === 429) { await sleep(1500); continue; }
      if (errCode === 404 || errMsg.includes('not found')) continue;
      return res.status(200).json({ error: `${model}: ${errMsg}` });

    } catch (err) { continue; }
  }

  return res.status(200).json({ error: 'Rate limit reached. Please wait 1 minute and try again.' });
}
