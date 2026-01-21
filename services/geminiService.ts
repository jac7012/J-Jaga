
import { GoogleGenAI, Type, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY || "";

export const getGeminiClient = () => {
  return new GoogleGenAI({ apiKey: API_KEY });
};

const GUARDIAN_LIVE_PROMPT = `You are the user's comforting "Guardian," acting as a calm, loving family member (like a parent). 
The user has just been in a car accident. 
1. Reassure them first: "Take a deep breath, I'm here. You're safe."
2. Use a warm, protective Malaysian-English (Manglish) or Standard English tone.
3. Guidance:
   - "Hold your phone up to the license plate."
   - "Now, show me the road tax sticker on the windshield."
   - "Check if there are any witnesses nearby. If so, point the camera at them so I can hear them."
4. AR Markers: Call 'draw_ar_marker' immediately when you see: 'license_plate', 'road_tax', 'witness', or 'car_damage'.
5. Testimony: When a witness speaks, acknowledge it: "I'm recording what they are saying."
6. Legal: Remind them: "Do not admit fault to anyone."
7. Malaysian Context: Act 1987 Road Transport context.`;

export const AR_TOOL_DECLARATION = {
  name: 'draw_ar_marker',
  parameters: {
    type: Type.OBJECT,
    description: 'Place a visual marker on an object in the video feed.',
    properties: {
      target: {
        type: Type.STRING,
        description: 'Object type: license_plate, road_tax, witness, body_damage',
      },
      label: {
        type: Type.STRING,
        description: 'A clear label like "PLATE DETECTED" or "WITNESS READY"',
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
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
}

export async function analyzeMechanic(audioBase64: string, quoteImage?: string) {
  const ai = getGeminiClient();
  const parts: any[] = [{ inlineData: { data: audioBase64, mimeType: 'audio/webm' } }, { text: "Analyze engine failure." }];
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
    contents: `Analyze: ${input}`,
    config: { responseMimeType: 'application/json' }
  });
  return JSON.parse(response.text || '{}');
}
