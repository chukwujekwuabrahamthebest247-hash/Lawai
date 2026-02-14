import { GroundingSource, SourceScope, VoiceGender, LegalMethod } from "../types";

/**
 * DYNAMIC KEY LOADER
 * Specifically designed for Vite + Vercel. 
 * Checks for VITE_ prefix (Vite standard) and raw names (Vercel dashboard).
 */
const getEnv = (key: string): string => {
  const value = import.meta.env[`VITE_${key}`] || import.meta.env[key] || "";
  return value.trim();
};

const OPENROUTER_API_URL = "https://openrouter.ai";
const SERPER_API_URL = "https://google.serper.dev";
const TAVILY_API_URL = "https://api.tavily.com";
const OPENROUTER_MODEL = "openrouter/free"; 

export const generateAIResponse = async (
  prompt: string,
  base64Images: string[] = [],
  legalMethod: LegalMethod = 'NONE',
  scope: SourceScope = 'NIGERIA'
): Promise<{ text: string; sources: GroundingSource[] }> => {

  // 1. KEY VALIDATION (Diagnostic)
  const SERPER_KEY = getEnv("SERPER_API_KEY");
  const TAVILY_KEY = getEnv("TAVILY_API_KEY");
  const OPENROUTER_KEY = getEnv("OPENROUTER_API_KEY");

  if (!SERPER_KEY) return { text: "Error: VITE_SERPER_API_KEY is missing in Vercel Settings.", sources: [] };
  if (!TAVILY_KEY) return { text: "Error: VITE_TAVILY_API_KEY is missing in Vercel Settings.", sources: [] };
  if (!OPENROUTER_KEY) return { text: "Error: VITE_OPENROUTER_API_KEY is missing in Vercel Settings.", sources: [] };

  try {
    // 2. MULTI-ENGINE RESEARCH
    const [serper, tavily] = await Promise.all([
      fetchSerper(prompt, SERPER_KEY),
      fetchTavily(prompt, TAVILY_KEY)
    ]);

    const uniqueSources = Array.from(new Map([...serper, ...tavily].map(s => [s.uri, s])).values());
    const searchContext = uniqueSources.map((s, i) => `[Source ${i+1}] ${s.title}\nURL: ${s.uri}\nData: ${s.snippet}`).join("\n\n");

    // 3. LEGAL PROMPT
    const scopeSuffix = scope === 'NIGERIA' ? "(Jurisdiction: Nigeria. Ground in 1999 Constitution & LFN.)" : "(Global Law)";
    const systemInstruction = `You are OmniSearch Legal Pro. Answer using RESEARCH CONTEXT. Provide citations. ${scopeSuffix}`;

    // 4. OPENROUTER CALL
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://vercel.com", 
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

    if (!response.ok) {
      const errorData = await response.json();
      return { text: `OpenRouter Error: ${errorData.error?.message || "Invalid API Key"}`, sources: [] };
    }

    const data = await response.json();
    return { 
      text: data.choices?.[0]?.message?.content || "No response generated.", 
      sources: uniqueSources.map(s => ({ title: s.title, uri: s.uri })) 
    };

  } catch (error: any) {
    console.error("Critical AI Error:", error);
    return { text: `System Error: ${error.message || "Connection failed"}`, sources: [] };
  }
};

/**
 * SPEECH UTILITIES (REQUIRED BY App.tsx)
 */
export const generateSpeech = async (text: string, voiceGender: VoiceGender): Promise<Uint8Array | null> => {
  if (!('speechSynthesis' in window)) return null;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`~>]/g, '').trim());
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang.includes('en') && 
    (voiceGender === 'MALE' ? v.name.toLowerCase().includes('male') : v.name.toLowerCase().includes('female')));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
  return new Uint8Array(0); 
};

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  return ctx.createBuffer(1, 1, 44100); 
}

/**
 * RESEARCH HELPERS
 */
async function fetchSerper(q: string, key: string) {
  try {
    const res = await fetch(SERPER_API_URL, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q })
    });
    if (!res.ok) throw new Error("Serper Key Invalid");
    const d = await res.json();
    return d.organic?.map((r: any) => ({ title: r.title, uri: r.link, snippet: r.snippet })) || [];
  } catch { return []; }
}

async function fetchTavily(q: string, key: string) {
  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query: q, search_depth: "basic" })
    });
    if (!res.ok) throw new Error("Tavily Key Invalid");
    const d = await res.json();
    return d.results?.map((r: any) => ({ title: r.title, uri: r.url, snippet: r.content })) || [];
  } catch { return []; }
}
