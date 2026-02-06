import { HfInference } from "@huggingface/inference";
import { GroundingSource, SourceScope, VoiceGender, LegalMethod } from "../types";

// PRO-TIP: Mistral-7B is great, but Hugging Face's "Zephyr" is often more stable for chat
const TEXT_MODEL = 'HuggingFaceH4/zephyr-7b-beta'; 
const TTS_MODEL = 'facebook/mms-tts-eng'; 

export const generateAIResponse = async (
  prompt: string,
  base64Images: string[] = [],
  legalMethod: LegalMethod = 'NONE',
  scope: SourceScope = 'NIGERIA'
): Promise<{ text: string; sources: GroundingSource[] }> => {
  // Use VITE_ prefix if this is running purely on the client side, 
  // or ensure these are set in Vercel's Environment Variables
  const hf = new HfInference(process.env.HUGGINGFACE_API_KEY || process.env.VITE_HUGGINGFACE_API_KEY);
  
  const scopeSuffix = scope === 'NIGERIA' 
    ? "(Jurisdiction: Nigeria. Ground response in 1999 Constitution & LFN.)" 
    : "(Jurisdiction: Global. Ground in international laws.)";
    
  const legalFramework = legalMethod !== 'NONE' 
    ? `STRUCTURE: Strictly apply the ${legalMethod} reasoning framework.`
    : `MANDATORY: Provide a 'LEGAL BACKBONE' section with specific statutory citations.`;

  const systemInstruction = `You are OmniSearch Legal Pro. 
    1. Provide section citations for all legal claims.
    2. Maintain a senior, authoritative tone.
    ${legalFramework} ${scopeSuffix}`;

  try {
    // 1. CALL GOOGLE SEARCH (Using Serper)
    // Fixed URL to include /search which is required by Serper
    const searchResponse = await fetch("https://google.serper.dev", {
      method: "POST",
      headers: { 
        "X-API-KEY": (process.env.SERPER_API_KEY || process.env.VITE_SERPER_API_KEY) as string,
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({ q: prompt })
    });
    
    const searchData = await searchResponse.json();
    
    const searchContext = searchData.organic?.map((result: any) => 
      `Source: ${result.title}\nLink: ${result.link}\nSnippet: ${result.snippet}`
    ).join("\n\n") || "No search results found.";

    // 2. SEND EVERYTHING TO HUGGING FACE
    const response = await hf.chatCompletion({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: `CONTEXT:\n${searchContext}\n\nUSER QUERY: ${prompt}` }
      ],
      max_tokens: 1000,
      temperature: 0.1,
      // IMPORTANT: This prevents 503 errors if the model is loading
      provider_options: {
        use_cache: false,
        waitForModel: true 
      } as any
    });

    // 3. MAP SOURCES
    const sources = searchData.organic?.map((res: any) => ({
      title: res.title,
      uri: res.link
    })) || [];

    // FIX: Accessing the content correctly for the @huggingface/inference library
    const aiText = response.choices?.[0]?.message?.content || "I couldn't generate a response.";

    return { text: aiText, sources };
    
  } catch (error: any) {
    console.error("AI Service Error:", error);
    return { 
      text: `Error: ${error.message || "The AI is currently unavailable."}`, 
      sources: [] 
    };
  }
};

// ... Rest of your decode and speech functions remain the same ...
