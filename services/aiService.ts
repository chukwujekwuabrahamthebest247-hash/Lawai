import { HfInference } from "@huggingface/inference";
import { GroundingSource, SourceScope, VoiceGender, LegalMethod } from "../types";

// RECOMMENDED: Use these models for the FREE serverless API
const TEXT_MODEL = 'meta-llama/Llama-3.1-8B-Instruct'; 
const TTS_MODEL = 'facebook/mms-tts-eng'; 

export const generateAIResponse = async (
  prompt: string,
  base64Images: string[] = [],
  legalMethod: LegalMethod = 'NONE',
  scope: SourceScope = 'NIGERIA'
): Promise<{ text: string; sources: GroundingSource[] }> => {
  // Uses the free Serverless Inference API
  const hf = new HfInference(process.env.VITE_HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_API_KEY);
  
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
    const searchResponse = await fetch("https://google.serper.dev", {
      method: "POST",
      headers: { 
        "X-API-KEY": (process.env.VITE_SERPER_API_KEY || process.env.SERPER_API_KEY) as string,
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({ q: prompt })
    });
    
    const searchData = await searchResponse.json();
    
    const searchContext = searchData.organic?.map((result: any) => 
      `Source: ${result.title}\nLink: ${result.link}\nSnippet: ${result.snippet}`
    ).join("\n\n") || "No search results found.";

    const response = await hf.chatCompletion({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: `CONTEXT:\n${searchContext}\n\nUSER QUERY: ${prompt}` }
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });

    const sources = searchData.organic?.map((res: any) => ({
      title: res.title,
      uri: res.link
    })) || [];

    const aiText = response.choices[0]?.message?.content || "I couldn't generate a response.";

    return { text: aiText, sources };
    
  } catch (error: any) {
    console.error("AI Service Error:", error);
    return { 
      text: `Error: ${error.message || "The AI is currently unavailable."}`, 
      sources: [] 
    };
  }
};

export const generateSpeech = async (text: string, voiceGender: VoiceGender): Promise<Uint8Array | null> => {
  const hf = new HfInference(process.env.VITE_HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_API_KEY);
  
  try {
    const cleanText = text
      .replace(/[#*_`~>]/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim()
      .slice(0, 4000);
    
    const response = await hf.textToSpeech({
      model: TTS_MODEL,
      inputs: cleanText,
    });

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);

  } catch (error) { 
    console.error("Hugging Face TTS failure:", error);
    return null; 
  }
};

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const frameCount = data.byteLength / 2 / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      const byteOffset = (i * numChannels + channel) * 2;
      if (byteOffset + 1 < data.byteLength) {
        const sample = view.getInt16(byteOffset, true);
        channelData[i] = sample / 32768.0;
      }
    }
  }
  return buffer;
}
