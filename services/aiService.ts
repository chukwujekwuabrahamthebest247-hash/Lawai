import { GroundingSource, SourceScope, VoiceGender, LegalMethod } from "../types";

// --- VITE KEY LOADER ---
// Vite requires VITE_ prefix to expose variables to the browser
const getEnv = (key: string) => {
  return import.meta.env[`VITE_${key}`] || "";
};

// FULL API ENDPOINTS
const OPENROUTER_API_URL = "https://openrouter.ai";
const SERPER_API_URL = "https://google.serper.dev";
const TAVILY_API_URL = "https://api.tavily.com";
const OPENROUTER_MODEL = "openrouter/free"; 

/**
 * 1. AI RESPONSE GENERATOR
 * Uses VITE_SERPER_API_KEY, VITE_TAVILY_API_KEY, VITE_OPENROUTER_API_KEY
 */
export const generateAIResponse = async (
  prompt: string,
  base64Images: string[] = [],
  legalMethod: LegalMethod = 'NONE',
  scope: SourceScope = 'NIGERIA'
): Promise<{ text: string; sources: GroundingSource[] }> => {

  // Explicitly loading keys with VITE_ prefix
  const SERPER_KEY = getEnv("SERPER_API_KEY");
  const TAVILY_KEY = getEnv("TAVILY_API_KEY");
  const OPENROUTER_KEY = getEnv("OPENROUTER_API_KEY");

  // A. Multi-Engine Research
  const [serper, tavily] = await Promise.all([
    fetchSerper(prompt, SERPER_KEY),
    fetchTavily(prompt, TAVILY_KEY)
  ]);

  const uniqueSources = Array.from(new Map([...serper, ...tavily].map(s => [s.uri, s])).values());
  const searchContext = uniqueSources.length > 0 
    ? uniqueSources.map((s, i) => `[Source ${i+1}] ${s.title}\nURL: ${s.uri}\nData: ${s.snippet}`).join("\n\n")
    : "No live data found. Rely on internal legal training.";

  // B. Legal Instruction
  const scopeSuffix = scope === 'NIGERIA' ? "(Jurisdiction: Nigeria. Ground in 1999 Constitution & LFN.)" : "(Global Law)";
  const systemInstruction = `You are OmniSearch Legal Pro. Answer using RESEARCH CONTEXT. Provide citations. ${scopeSuffix}`;

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://yourapp.com", 
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
      text: data.choices?.[0]?.message?.content || "No response generated.", 
      sources: uniqueSources.map(s => ({ title: s.title, uri: s.uri })) 
    };
  } catch (error) {
    return { text: "Search Error: Check Vercel API keys.", sources: [] };
  }
};

/**
 * 2. SPEECH UTILITIES (REQUIRED BY App.tsx)
 * No Hugging Face - Uses Native Browser Speech
 */
export const generateSpeech = async (text: string, voiceGender: VoiceGender): Promise<Uint8Array | null> => {
  if (!('speechSynthesis' in window)) return null;
  
  window.speechSynthesis.cancel();
  const cleanText = text.replace(/[#*_`~>]/g, '').replace(/\[.*?\]\(.*?\)/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang.includes('en') && 
    (voiceGender === 'MALE' ? v.name.toLowerCase().includes('male') : v.name.toLowerCase().includes('female')));
  
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);

  // Return empty array to satisfy the Uint8Array return type in App.tsx
  return new Uint8Array(0); 
};

// Satisfies the import in App.tsx
export async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  return ctx.createBuffer(1, 1, 44100); 
}

/**
 * 3. RESEARCH HELPERS
 */
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
