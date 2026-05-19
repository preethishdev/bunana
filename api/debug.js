export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ error: 'No API key' });

  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listResp = await fetch(listUrl);
    const listData = await listResp.json();
    
    if (!listResp.ok) {
      return res.status(200).json({ 
        listError: listData.error?.message,
        listCode: listData.error?.code
      });
    }

    const geminiModels = (listData.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));

    let testResult = null;
    if (geminiModels.length > 0) {
      const testModel = geminiModels[0];
      const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent?key=${apiKey}`;
      const testResp = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }],
          generationConfig: { maxOutputTokens: 20 }
        })
      });
      const testData = await testResp.json();
      testResult = {
        model: testModel,
        status: testResp.status,
        text: testData.candidates?.[0]?.content?.parts?.[0]?.text || testData.error?.message
      };
    }

    return res.status(200).json({ availableModels: geminiModels, testResult });

  } catch(err) {
    return res.status(200).json({ error: err.message });
  }
}
