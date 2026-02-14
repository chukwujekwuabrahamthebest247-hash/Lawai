// services/aiService.ts
import { GroundingSource, SourceScope, VoiceGender } from "../types";

export const generateAIResponse = async (
  prompt: string, 
  base64Images: string[] = [], 
  legalMethod: string = 'NONE', 
  scope: SourceScope = 'NIGERIA'
): Promise<{ text: string; sources: GroundingSource[] }> => {
  
  try {
    // We call our OWN internal API route
    const response = await fetch("/api/legal-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, scope })
    });

    if (!response.ok) throw new Error("Proxy failed");
    return await response.json();
  } catch (error) {
    return { text: "Connection error. Please try again.", sources: [] };
  }
};

// Required for App.tsx build
export const generateSpeech = async (text: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
  return new Uint8Array(0);
};

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext) {
  return ctx.createBuffer(1, 1, 44100);
}
