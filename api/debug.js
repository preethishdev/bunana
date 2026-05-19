export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ error: 'No API key' });

  const prompt = `You are Bunana, a warm AI cooking assistant.
Ingredients: beef, tomato, coconut milk.
Generate exactly 2 recipes. Return ONLY valid JSON array, no markdown.
[{"name":"","cuisine":"","time":"","difficulty":"","servings":"","description":"","ingredients":[""],"steps":[""],"nutrition":{"calories":"","protein":"","carbs":"","fat":""},"tip":""}]

IMPORTANT: Return ONLY a valid JSON array. No markdown, no backticks, no explanation. Start with [ and end with ]`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
      })
    });

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'NO TEXT';
    
    return res.status(200).json({
      status: response.status,
      rawText: rawText,
      first100: rawText.substring(0, 100),
      last100: rawText.substring(Math.max(0, rawText.length - 100)),
      startsWithBracket: rawText.trim().startsWith('['),
      endsWithBracket: rawText.trim().endsWith(']')
    });
  } catch(err) {
    return res.status(200).json({ error: err.message });
  }
}
