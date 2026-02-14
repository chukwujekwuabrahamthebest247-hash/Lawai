import { GroundingSource, SourceScope, VoiceGender, LegalMethod } from "../types";

// --- VITE KEY LOADER ---
const getEnv = (key: string) => {
  // Vite requires the VITE_ prefix to expose variables to the client side
  return import.meta.env[`VITE_${key}`] || "";
};

// FULL API ENDPOINTS
const OPENROUTER_API_URL = "https://openrouter.ai";
const SERPER_API_URL = "https://google.serper.dev";
const TAVILY_API_URL = "https://api.tavily.com";

const OPENROUTER_MODEL = "openrouter/free"; 

/**
 * 1. AI RESPONSE GENERATOR (OpenRouter + Tavily + Serper)
 */
export const generateAIResponse = async (
  prompt: string,
  base64Images: string[] = [],
  legalMethod: LegalMethod = 'NONE',
  scope: SourceScope = 'NIGERIA'
): Promise<{ text: string; sources: GroundingSource[] }> => {

  // Load keys (Ensure these are named VITE_... in Vercel/Local)
  const SERPER_KEY = getEnv("SERPER_API_KEY");
  const TAVILY_KEY = getEnv("TAVILY_API_KEY");
  const OPENROUTER_KEY = getEnv("OPENROUTER_API_KEY");

  // A. Multi-Engine Research (Run in parallel for speed)
  const [serper, tavily] = await Promise.all([
    fetchSerper(prompt, SERPER_KEY),
    fetchTavily(prompt, TAVILY_KEY)
  ]);

  // B. Merge & Deduplicate Sources
  const uniqueSources = Array.from(new Map([...serper, ...tavily].map(s => [s.uri, s])).values());
  const searchContext = uniqueSources.length > 0 
    ? uniqueSources.map((s, i) => `[Source ${i+1}] ${s.title}\nURL: ${s.uri}\nData: ${s.snippet}`).join("\n\n")
    : "No live data found. Rely on internal legal training.";

  // C. Legal Instructions
  const scopeSuffix = scope === 'NIGERIA' 
    ? "(Jurisdiction: Nigeria. Ground in 1999 Constitution & LFN.)" 
    : "(Jurisdiction: Global. Ground in International Law.)";

  const systemInstruction = `You are OmniSearch Legal Pro. 
1. Use the RESEARCH CONTEXT provided to answer. 
2. Provide specific section citations (e.g., Section 1 of the 1999 Constitution). 
3. Maintain a senior, authoritative tone. 
${scopeSuffix}`;

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://yourapp.com", // Recommended for OpenRouter
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `RESEARCH CONTEXT:\n${searchContext}\n\nQUERY: ${prompt}` }
        ],
        temperature: 0.1,
      })
    });

    const data = await response.json();
    const aiText = data.choices?.[0]?.message?.content || "I couldn't generate a response.";

    return { 
      text: aiText, 
      sources: uniqueSources.map(s => ({ title: s.title, uri: s.uri })) 
    };
  } catch (error) {
    console.error("Research AI Error:", error);
    return { text: "Search Error: Ensure VITE_ API keys are added in Vercel settings.", sources: [] };
  }
};

// --- RESEARCH HELPERS (Using Full Paths) ---
async function fetchSerper(q: string, key: string) {
  if (!key) return [];
  try {
    const res = await fetch(SERPER_API_URL, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q })
    });
    const d = await res.json();
    return d.organic?.map((r: any) => ({ title: r.title, uri: r.link, snippet: r.snippet })) || [];
  } catch { return []; }
}

async function fetchTavily(q: string, key: string) {
  if (!key) return [];
  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query: q, search_depth: "basic" })
    });
    const d = await res.json();
    return d.results?.map((r: any) => ({ title: r.title, uri: r.url, snippet: r.content })) || [];
  } catch { return []; }
}

/**
 * 2. SPEECH GENERATOR (Free Native Browser API)
 */
export const speakResponse = (text: string, voiceGender: VoiceGender) => {
  if (!('speechSynthesis' in window)) return;

  // Clean text from markdown/links
  const cleanText = text.replace(/[#*_`~>]/g, '').replace(/\[.*?\]\(.*?\)/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => 
    v.lang.includes('en') && 
    (voiceGender === 'MALE' ? v.name.toLowerCase().includes('male') : v.name.toLowerCase().includes('female'))
  );

  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.rate = 1.0;
  
  window.speechSynthesis.cancel(); 
  window.speechSynthesis.speak(utterance);
};
