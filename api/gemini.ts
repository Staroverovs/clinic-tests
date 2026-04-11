import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { model, contents, config } = req.body;
  if (!model || !contents) {
    return res.status(400).json({ error: 'Missing model or contents' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body: any = { contents: Array.isArray(contents) ? contents : [{ parts: [{ text: contents }] }] };
    if (config?.systemInstruction) {
      body.systemInstruction = { parts: [{ text: config.systemInstruction }] };
    }
    if (config?.responseMimeType) {
      body.generationConfig = { responseMimeType: config.responseMimeType };
    }
    if (config?.temperature !== undefined || config?.maxOutputTokens !== undefined) {
      body.generationConfig = {
        ...(body.generationConfig || {}),
        ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
        ...(config.maxOutputTokens !== undefined ? { maxOutputTokens: config.maxOutputTokens } : {}),
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ text });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
