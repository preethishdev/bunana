// api/test.js — temporary test endpoint
// Visit /api/test to see if the Gemini API key is working
export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(200).json({ 
      status: 'ERROR', 
      message: 'GEMINI_API_KEY environment variable is not set' 
    });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say the word: working' }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(200).json({ 
        status: 'API_ERROR', 
        code: response.status,
        error: data.error?.message || 'Unknown error',
        details: data.error
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ 
      status: 'SUCCESS', 
      response: text,
      keyPrefix: apiKey.substring(0, 10) + '...'
    });

  } catch (err) {
    return res.status(200).json({ 
      status: 'FETCH_ERROR', 
      message: err.message 
    });
  }
}
