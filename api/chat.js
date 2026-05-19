export const config = { api: { bodyParser: true } };

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

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  const enhancedPrompt = userText + '\n\nIMPORTANT: Return ONLY a valid JSON array. No markdown, no backticks, no explanation. Start with [ and end with ]';

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
        })
      });

      const data = await response.json();

      if (response.ok) {
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const start = text.indexOf('[');
        if (start > 0) text = text.substring(start);
        const end = text.lastIndexOf(']');
        if (end !== -1) text = text.substring(0, end + 1);
        return res.status(200).json({ content: [{ type: 'text', text }] });
      }

      const errCode = data.error?.code || response.status;
      if (errCode === 429) { await new Promise(r => setTimeout(r, 1500)); continue; }
      if (errCode === 404) continue;
      return res.status(200).json({ error: data.error?.message || 'API error' });

    } catch (err) { continue; }
  }
  return res.status(200).json({ error: 'All models unavailable. Please try again in 1 minute.' });
}
