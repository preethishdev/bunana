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

  // Detect request type
  const isRecipeRequest      = userText.includes('Generate exactly 2 recipes');
  const isBrowseRequest      = userText.includes('Generate a detailed recipe for');
  const isTranslationRequest = userText.includes('food ingredient translator') ||
                               userText.includes('multilingual ingredient translator');
  const isJsonRequest        = isRecipeRequest || isBrowseRequest;

  const finalPrompt = isJsonRequest
    ? userText +
      '\n\nCRITICAL: Respond with ONLY valid JSON. ' +
      (isRecipeRequest
        ? 'The response MUST start with [ and end with ].'
        : 'The response MUST start with { and end with }.') +
      ' No markdown, no backticks, no explanation, no text before or after the JSON.'
    : userText;

  const maxTokens = isRecipeRequest ? 8192
                  : isBrowseRequest ? 3000
                  : isTranslationRequest ? 500
                  : 1000;

  // Helper: does this error mean "model busy — try the next one"?
  const isRetryableError = (code, msg) => {
    if (code === 429 || code === 503 || code === 500) return true;
    const m = (msg || '').toLowerCase();
    return m.includes('high demand') || m.includes('overload') ||
           m.includes('temporar')   || m.includes('try again') ||
           m.includes('resource')   || m.includes('exhausted') ||
           m.includes('unavailable')|| m.includes('capacity');
  };

  const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash'];
  let lastError = '';
  let sawOverload = false;

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
            maxOutputTokens: maxTokens,
          },
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const parts = data.candidates?.[0]?.content?.parts || [];
        let text = parts
          .filter(p => !p.thought)
          .map(p => p.text || '')
          .join('')
          .trim();

        if (isJsonRequest) {
          text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
          if (isRecipeRequest) {
            const s = text.indexOf('['), e = text.lastIndexOf(']');
            if (s !== -1 && e > s) text = text.substring(s, e + 1);
          } else if (isBrowseRequest) {
            const s = text.indexOf('{'), e = text.lastIndexOf('}');
            if (s !== -1 && e > s) text = text.substring(s, e + 1);
          }
        }

        return res.status(200).json({ content: [{ type: 'text', text }] });
      }

      const errCode = data.error?.code || response.status;
      const errMsg  = data.error?.message || '';
      lastError = errMsg;

      // 503 "high demand" / 429 rate limit / transient 500:
      // brief pause, then fall through to the NEXT model in the chain
      if (isRetryableError(errCode, errMsg)) {
        sawOverload = true;
        await new Promise(r => setTimeout(r, 1200));
        continue;
      }
      // Model doesn't exist — silently try next
      if (errCode === 404 || errMsg.includes('not found')) continue;

      // Genuine non-retryable error (bad API key, blocked content, etc.)
      return res.status(200).json({ error: errMsg || 'API error' });

    } catch (err) {
      lastError = err.message || 'network error';
      continue;
    }
  }

  // All models exhausted — structured 429 so the frontend shows its countdown
  return res.status(429).json({
    error: sawOverload
      ? 'Gemini is experiencing high demand right now. Bunana will auto-retry.'
      : 'Rate limit reached. Bunana will auto-retry shortly.',
    retryAfter: sawOverload ? 20 : 15,
  });
}
