// api/chat.js — Vercel Serverless Function
// Secure proxy between Bunana and Google Gemini API

export default async function handler(req, res) {

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  try {
    // Extract messages from request body
    const messages = req.body.messages || [];
    
    // Build Gemini contents array properly
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
    }));

    // Use gemini-1.5-flash — stable, fast, free tier
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const geminiBody = {
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2000
      }
    };

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(response.status).json({ 
        error: data.error?.message || 'Gemini API error',
        details: data 
      });
    }

    // Convert to Anthropic-style response so Bunana works without changes
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return res.status(200).json({
      content: [{ type: 'text', text: text }]
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Proxy error: ' + error.message });
  }
}
