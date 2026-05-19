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

  // Detect if this is a recipe request or a translation request
  const isRecipeRequest = userText.includes('Generate exactly 2 recipes');
  const isTranslationRequest = userText.includes('multilingual ingredient translator');

  // Only add JSON instruction for recipe requests — not translations
  const finalPrompt = isRecipeRequest
    ? userText + '\n\nCRITICAL: Your entire response must be ONLY a JSON array starting with [ and ending with ]. No text before or after. No markdown. No backticks.'
    : userText;

  // Use gemini-2.0-flash first — no thinking overhead, clean output
  // Fall back to 2.5-flash and lite if needed
  const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash'];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
          generationConfig: {
            temperature: isTranslationRequest ? 0.1 : 0.7,
            maxOutputTokens: isRecipeRequest ? 8192 : 100
          }
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Join ALL parts — handles thinking models that split response
        const parts = data.candidates?.[0]?.content?.parts || [];
        let text = parts
          .filter(p => !p.thought) // exclude thinking tokens from gemini-2.5
          .map(p => p.text || '')
          .join('')
          .trim();

        if (isRecipeRequest) {
          // Strip any markdown fences
          text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
          // Extract just the JSON array
          const start = text.indexOf('[');
          const end = text.lastIndexOf(']');
          if (start !== -1 && end !== -1 && end > start) {
            text = text.substring(start, end + 1);
          }
        }

        return res.status(200).json({ content: [{ type: 'text', text }] });
      }

      const errCode = data.error?.code || response.status;
      const errMsg = data.error?.message || '';
      if (errCode === 429) { await new Promise(r => setTimeout(r, 1500)); continue; }
      if (errCode === 404 || errMsg.includes('not found')) continue;
      return res.status(200).json({ error: errMsg || 'API error' });

    } catch (err) { continue; }
  }

  return res.status(429).json({ error: 'Rate limit reached. Please wait 1 minute and try again.' });
}
