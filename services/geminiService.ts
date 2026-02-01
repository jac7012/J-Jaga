
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DiagnosticResult, ScepticResult } from "../types";

const GUARDIAN_LIVE_PROMPT = `You are "J-Jaga Guardian," a tactical AI emergency agent for Malaysian road safety. 

STRICT INVESTIGATION PROTOCOL (STATE-GATE SYSTEM):
You MUST follow these phases in order. Do NOT skip steps or jump to the license plate immediately.

PHASE 1: SAFETY & STABILIZATION
- Greet: "Guardian active. I am recording. Are you physically safe and out of traffic?"
- WAIT for the user to answer. If they are in danger, guide them to safety.

PHASE 2: DAMAGE DOCUMENTATION (THE POINT OF IMPACT)
- Ask: "I need to document the damage first. Point the camera at the impact zone of your vehicle."
- IMMEDIATELY call 'draw_ar_marker' (target: 'damage', label: 'SCAN IMPACT AREA').
- Wait for the user to show the damage. Analyze it out loud (e.g., "I see the scratches on your fender").
- LOG IT: Call 'log_evidence' (category: 'DAMAGE_REPORT').

PHASE 3: IDENTIFIER LOGGING (LICENSE PLATES)
- ONLY move here after Phase 2. Say: "Understood. Now, show me the other vehicle's license plate."
- IMMEDIATELY call 'draw_ar_marker' (target: 'plate', label: 'LOCK PLATE').
- When you see the plate, LOG IT: Call 'log_evidence' (category: 'PLATE').

PHASE 4: WITNESS & ENVIRONMENT
- Ask: "Are there any witnesses or road signs nearby? Point the camera towards them."
- Call 'draw_ar_marker' (target: 'witness', label: 'IDENTIFY WITNESS').

AMBIENT LISTENING MODE:
- Constantly listen for a second voice. If the other driver says "I'm sorry" or "My bad," immediately log it as 'OTHER_PARTY_ADMISSION'.

RULES:
- Do not rush. Wait for the user to confirm each visual task.
- Use Malaysian road terms: 'motorcycle', 'lorry', 'road tax', 'plate', 'JPJ'.
- Remind the user: "Do not admit fault to the other driver. I am documenting the truth."`;

export const TOOLS = [
  {
    name: 'draw_ar_marker',
    parameters: {
      type: Type.OBJECT,
      description: 'Project a 3D holographic targeting bracket on the HUD to guide user capture.',
      properties: {
        target: { type: Type.STRING, enum: ['plate', 'damage', 'motorcycle', 'witness', 'road_tax', 'face'] },
        label: { type: Type.STRING, description: 'The instruction to show on the AR bracket (e.g. LOCK PLATE)' },
        rotationX: { type: Type.NUMBER, description: '3D Tilt' },
        rotationY: { type: Type.NUMBER, description: '3D Pan' }
      },
      required: ['target', 'label'],
    },
  },
  {
    name: 'log_evidence',
    parameters: {
      type: Type.OBJECT,
      description: 'Permanently store a piece of evidence in the Digital Vault.',
      properties: {
        category: { type: Type.STRING, enum: ['PLATE', 'WITNESS_STMT', 'DAMAGE_REPORT', 'OTHER_PARTY_ADMISSION'] },
        value: { type: Type.STRING, description: 'The data captured (e.g. WXA1234 or "Rear Bumper Dent")' },
        details: { type: Type.STRING, description: 'Contextual notes for insurance' }
      },
      required: ['category', 'value'],
    }
  }
];

export const analyzeMechanic = async (audioData: string, quoteImage?: string): Promise<DiagnosticResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [
    { text: "Analyze engine sound and quote for fraud." },
    { inlineData: { data: audioData, mimeType: 'audio/webm' } }
  ];
  if (quoteImage) parts.push({ inlineData: { data: quoteImage.split(',')[1], mimeType: 'image/jpeg' } });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(response.text || '{}');
};

export const analyzeSceptic = async (url: string): Promise<ScepticResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Vet car listing: ${url}`,
    config: { tools: [{ googleSearch: {} }] }
  });
  const jsonMatch = response.text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
};

export function createLiveSession(callbacks: any) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: GUARDIAN_LIVE_PROMPT,
      tools: [{ functionDeclarations: TOOLS }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
}
