export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ error: 'No API key' });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Return this exact JSON only: [{"name":"test","cuisine":"test","time":"5 min","difficulty":"easy","servings":"1","description":"test","ingredients":["1 egg"],"steps":["boil egg"],"nutrition":{"calories":"100","protein":"6g","carbs":"0g","fat":"5g"},"tip":"test tip"}]' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 500 }
      })
    });
    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'NO TEXT';
    return res.status(200).json({
      status: response.status,
      rawText: rawText,
      first50chars: rawText.substring(0, 50),
      last50chars: rawText.substring(rawText.length - 50)
    });
  } catch(err) {
    return res.status(200).json({ error: err.message });
  }
}
