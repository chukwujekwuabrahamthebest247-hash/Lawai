// api/legal-proxy.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { prompt, scope } = req.body;

  // Use standard process.env (Vercel automatically injects these)
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
  const SERPER_KEY = process.env.SERPER_API_KEY;
  const TAVILY_KEY = process.env.TAVILY_API_KEY;

  try {
    // 1. Search Research
    const [serperRes, tavilyRes] = await Promise.all([
      fetch("https://google.serper.dev", {
        method: "POST",
        headers: { "X-API-KEY": SERPER_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({ q: prompt })
      }).then(r => r.json()),
      fetch("https://api.tavily.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: TAVILY_KEY, query: prompt })
      }).then(r => r.json())
    ]);

    const sources = [...(serperRes.organic || []), ...(tavilyRes.results || [])];
    const context = sources.map((s: any) => s.snippet || s.content).join("\n\n");

    // 2. AI Brain
    const aiRes = await fetch("https://openrouter.ai", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          { role: "system", content: `Legal Pro. Scope: ${scope}. Use context.` },
          { role: "user", content: `CONTEXT: ${context}\n\nQUERY: ${prompt}` }
        ]
      })
    });

    const data = await aiRes.json();
    return res.status(200).json({ 
      text: data.choices[0].message.content, 
      sources: sources.map(s => ({ title: s.title, uri: s.link || s.url })) 
    });

  } catch (error) {
    return res.status(500).json({ error: "Server-side research failed" });
  }
}
