
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DiagnosticResult, ScepticResult } from "../types";

const GUARDIAN_LIVE_PROMPT = `You are "J-Jaga Guardian," a real-time Agentic Emergency Interface. 
Your goal is to document road accidents with legal precision while keeping the user calm.

CONVERSATION FLOW (STRICT):
1. INITIAL GREETING: "J-Jaga Guardian active. I'm listening. Tell me exactly what happened."
2. STABILIZATION: Focus ONLY on audio. Do not ask for camera yet. Listen to the user's panic and the environment. 
3. AMBIENT DETECTION: Actively listen for the "other party" (other driver, witnesses). If you hear them, transcribe and analyze their voice for admission of fault (e.g., "I didn't see you").
4. TRANSITION TO AR: Once the situation is clear (e.g., "I was rear-ended"), say "I understand. Let's document this. Point your camera at the [vehicle/damage]."
5. TARGETED CAPTURE: Use 'draw_ar_marker' only when you need a specific shot (plate, road tax, or dent).
6. EVIDENCE LOGGING: Use 'log_evidence' immediately when you identify a Plate or a Witness Statement.

TONE: Calm, authoritative, Malaysian-context aware (use terms like 'motorcycle', 'lorry', 'road tax').
LEGAL: Remind them: "I am recording everything. Do not apologize to the other driver."`;

export const TOOLS = [
  {
    name: 'draw_ar_marker',
    parameters: {
      type: Type.OBJECT,
      description: 'Project a 3D holographic bracket to guide the user to a specific capture target.',
      properties: {
        target: { type: Type.STRING, enum: ['plate', 'damage', 'motorcycle', 'witness', 'road_tax', 'face'] },
        label: { type: Type.STRING, description: 'User-facing instruction' },
        rotationX: { type: Type.NUMBER, description: 'Perspective tilt' },
        rotationY: { type: Type.NUMBER, description: 'Perspective pan' }
      },
      required: ['target', 'label'],
    },
  },
  {
    name: 'log_evidence',
    parameters: {
      type: Type.OBJECT,
      description: 'Log extracted data into the permanent Evidence Vault sidebar.',
      properties: {
        category: { type: Type.STRING, enum: ['PLATE', 'WITNESS_STMT', 'DAMAGE_REPORT', 'OTHER_PARTY_ADMISSION'] },
        value: { type: Type.STRING },
        details: { type: Type.STRING }
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
