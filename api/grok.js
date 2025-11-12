// api/grok.js — calls Grok for X search
export default async function handler(req, res) {
  // CORS etc. (same as before)
  res.setHeader('Access-Control-Allow-Origin', '*');
  // ... other headers

  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing ?q=...' });

  // Call Grok for X search (via xAI API)
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-3-mini',
      messages: [
        {
          role: 'system',
          content: 'You are Grok. Fetch the latest 10 X posts on the query. Return ONLY JSON array of {id, text, author, username, url, created_at, likes, replies}.'
        },
        { role: 'user', content: `Latest X posts for "${query}".` }
      ],
      max_tokens: 2000,
      temperature: 0.1
    }),
  });

  if (!response.ok) return res.status(500).json({ error: 'Grok failed' });

  const { choices } = await response.json();
  const content = choices[0].message.content;
  const posts = JSON.parse(content);  // Assume Grok returns array

  return res.status(200).json({ data: posts });
}