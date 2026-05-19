// api/test.js — diagnostic endpoint
export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(200).json({ status: 'NO_KEY', message: 'GEMINI_API_KEY not set in environment' });
  }

  // List available models
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listResp = await fetch(listUrl);
    const listData = await listResp.json();
    
    if (!listResp.ok) {
      return res.status(200).json({ 
        status: 'KEY_ERROR', 
        keyPrefix: apiKey.substring(0,12)+'...',
        error: listData.error?.message,
        code: listData.error?.code
      });
    }

    const models = (listData.models || [])
      .filter(m => m.name.includes('gemini'))
      .map(m => m.name);

    // Try first available model
    if (models.length > 0) {
      const modelName = models[0].replace('models/', '');
      const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const testResp = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Say: working' }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      });
      const testData = await testResp.json();
      const text = testData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      return res.status(200).json({
        status: testResp.ok ? 'SUCCESS' : 'MODEL_ERROR',
        keyPrefix: apiKey.substring(0,12)+'...',
        availableModels: models,
        testedModel: modelName,
        response: text,
        error: testResp.ok ? null : testData.error?.message
      });
    }

    return res.status(200).json({ 
      status: 'NO_MODELS', 
      keyPrefix: apiKey.substring(0,12)+'...',
      availableModels: [] 
    });

  } catch (err) {
    return res.status(200).json({ status: 'FETCH_ERROR', message: err.message });
  }
}
