
import { GoogleGenAI, Modality } from "@google/genai";
import { GroundingSource, SourceScope, VoiceGender, LegalMethod } from "../types";

const TEXT_MODEL = 'gemini-3-flash-preview';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

export const generateAIResponse = async (
  prompt: string,
  base64Images: string[] = [],
  legalMethod: LegalMethod = 'NONE',
  scope: SourceScope = 'NIGERIA'
): Promise<{ text: string; sources: GroundingSource[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const scopeSuffix = scope === 'NIGERIA' 
    ? "(Jurisdiction: Nigeria. Ground response in 1999 Constitution & LFN. Use 'googleSearch' tool.)" 
    : "(Jurisdiction: Global. Ground in international laws. Use 'googleSearch' tool.)";
    
  const parts: any[] = [{ text: `QUERY: ${prompt}\n\n${scopeSuffix}` }];
  
  base64Images.forEach((img) => {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: img.split(',')[1] || img
      }
    });
  });

  const legalFramework = legalMethod !== 'NONE' 
    ? `STRUCTURE: Strictly apply the ${legalMethod} reasoning framework.`
    : `MANDATORY: Provide a 'LEGAL BACKBONE' section with specific statutory citations.`;

  const systemInstruction = `You are OmniSearch Legal Pro.
    1. ALWAYS use the 'googleSearch' tool for factual grounding.
    2. Provide section citations for all legal claims.
    3. Maintain a senior, authoritative tone.
    ${legalFramework}`;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: { parts },
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    });

    const sources: GroundingSource[] = [];
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web) {
          sources.push({ title: chunk.web.title || "Reference", uri: chunk.web.uri });
        }
      });
    }

    return { text: response.text || "Investigation concluded with no specific findings.", sources };
  } catch (error) {
    console.error("Synthesis error:", error);
    throw error;
  }
};

export const generateSpeech = async (text: string, voiceGender: VoiceGender): Promise<Uint8Array | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const voiceName = voiceGender === 'FEMALE' ? 'Kore' : 'Fenrir';
  try {
    // Aggressive cleaning for TTS stability
    const cleanText = text
      .replace(/[#*_`~>]/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim()
      .slice(0, 4000);
    
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { 
          voiceConfig: { 
            prebuiltVoiceConfig: { voiceName } 
          } 
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData?.data);
    return audioPart?.inlineData?.data ? decode(audioPart.inlineData.data) : null;
  } catch (error) { 
    console.error("Vocal synthesis failure:", error);
    return null; 
  }
};

export function decode(base64: string): Uint8Array {
  // Clean whitespace just in case
  const binaryString = atob(base64.replace(/\s/g, ''));
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
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
  // Use DataView for maximum byte-alignment safety with 16-bit PCM
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const frameCount = data.byteLength / 2 / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      const byteOffset = (i * numChannels + channel) * 2;
      // Read 16-bit signed integer (little-endian) and normalize to [-1, 1]
      const sample = view.getInt16(byteOffset, true);
      channelData[i] = sample / 32768.0;
    }
  }
  return buffer;
}
