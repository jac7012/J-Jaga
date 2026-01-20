
import { GoogleGenAI, Type, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY || "";

export const getGeminiClient = () => {
  return new GoogleGenAI({ apiKey: API_KEY });
};

const GUARDIAN_LIVE_PROMPT = `You are the user's comforting "Guardian" (acting as a calm, loving family member). 
The user has just been in a car accident. 
1. Reassure them first: "Take a deep breath, you're safe, I'm here."
2. Use a warm, parental tone. 
3. Guide them using the video feed. If you see a license plate, tell them to hold steady.
4. Use the function 'draw_ar_marker' to highlight things like 'license_plate', 'road_tax', or 'witness'.
5. If a witness is present, tell the user to point the phone at them so you can record their testimony.
6. Context: Malaysian Road Transport Act 1987. Remind them: "Don't admit fault."`;

export const AR_TOOL_DECLARATION = {
  name: 'draw_ar_marker',
  parameters: {
    type: Type.OBJECT,
    description: 'Highlight a specific area on the user screen with an AR box.',
    properties: {
      target: {
        type: Type.STRING,
        description: 'The entity to highlight (e.g., license_plate, body_damage, witness, road_tax)',
      },
      label: {
        type: Type.STRING,
        description: 'A short label to show next to the marker.',
      },
    },
    required: ['target', 'label'],
  },
};

export function createLiveSession(callbacks: any) {
  const ai = getGeminiClient();
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: GUARDIAN_LIVE_PROMPT,
      tools: [{ functionDeclarations: [AR_TOOL_DECLARATION] }],
    },
  });
}

// Keeping existing static analysis functions...
export async function analyzeMechanic(audioBase64: string, quoteImage?: string) {
  const ai = getGeminiClient();
  const parts: any[] = [{ inlineData: { data: audioBase64, mimeType: 'audio/webm' } }, { text: "Analyze for mechanical failure." }];
  if (quoteImage) parts.push({ inlineData: { data: quoteImage.split(',')[1], mimeType: 'image/jpeg' } });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { responseMimeType: 'application/json' }
  });
  return JSON.parse(response.text || '{}');
}

export async function analyzeSceptic(input: string) {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze listing: ${input}`,
    config: { responseMimeType: 'application/json' }
  });
  return JSON.parse(response.text || '{}');
}
