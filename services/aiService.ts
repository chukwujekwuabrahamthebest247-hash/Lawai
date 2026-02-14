import { GroundingSource, SourceScope, VoiceGender, LegalMethod } from "../types";

// --- DYNAMIC KEY LOADER ---
const getEnv = (key: string) => {
  return (import.meta.env?.[`VITE_${key}`]) || (process.env?.[`VITE_${key}`]) || (process.env?.[key]) || "";
};

const OPENROUTER_API_URL = "https://openrouter.ai";
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

  const SERPER_KEY = getEnv("SERPER_API_KEY");
  const TAVILY_KEY = getEnv("TAVILY_API_KEY");
  const OPENROUTER_KEY = getEnv("OPENROUTER_API_KEY");

  // A. Multi-Engine Research
  const [serper, tavily] = await Promise.all([
    fetchSerper(prompt, SERPER_KEY),
    fetchTavily(prompt, TAVILY_KEY)
  ]);

  const uniqueSources = Array.from(new Map([...serper, ...tavily].map(s => [s.uri, s])).values());
  const searchContext = uniqueSources.map((s, i) => `[${i+1}] ${s.title}\nURL: ${s.uri}\nData: ${s.snippet}`).join("\n\n");

  // B. Legal Instruction
  const scopeSuffix = scope === 'NIGERIA' ? "(Jurisdiction: Nigeria. Use 1999 Constitution & LFN.)" : "(Global Law)";
  const systemInstruction = `You are OmniSearch Legal Pro. Answer based on RESEARCH CONTEXT. Provide citations. ${scopeSuffix}`;

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json"
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
    return { 
      text: data.choices[0]?.message?.content || "No response generated.", 
      sources: uniqueSources.map(s => ({ title: s.title, uri: s.uri })) 
    };
  } catch (error) {
    return { text: "Search Error: Check Vercel API keys.", sources: [] };
  }
};

// --- RESEARCH HELPERS ---
async function fetchSerper(q: string, key: string) {
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev", {
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
    const res = await fetch("https://api.tavily.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query: q, search_depth: "basic" })
    });
    const d = await res.json();
    return d.results?.map((r: any) => ({ title: r.title, uri: r.url, snippet: r.content })) || [];
  } catch { return []; }
}

/**
 * 2. SPEECH GENERATOR (Native Browser API - No Hugging Face)
 */
export const speakResponse = (text: string, voiceGender: VoiceGender) => {
  if (!('speechSynthesis' in window)) return;

  // Clean text from markdown/links
  const cleanText = text.replace(/[#*_`~>]/g, '').replace(/\[.*?\]\(.*?\)/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  
  // Find a suitable voice
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => 
    v.lang.includes('en') && 
    (voiceGender === 'MALE' ? v.name.includes('Male') : v.name.includes('Female'))
  );

  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.rate = 1.0;
  
  window.speechSynthesis.speak(utterance);
};
