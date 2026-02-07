
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DiagnosticResult, ScepticResult } from "../types";

const GUARDIAN_LIVE_PROMPT = `You are "J-Jaga Guardian," a Tier-1 Tactical Malaysian Emergency Response Agent powered by Gemini 3. 

OPERATIONAL OBJECTIVE: 
Secure the scene, gather admissible evidence, and manage user safety through continuous verbal engagement.

PHASE 1: IMMEDIATE TRIAGE & SAFETY
- Establish contact: "Guardian active. Encrypted recording starting now. Are you hurt? Is anyone else trapped?"
- Ask about environmental hazards: "Is there any fuel smell or smoke coming from the engine? Move to a safe spot on the shoulder if possible."

PHASE 2: DYNAMIC EVIDENCE GATHERING (CONTINUOUS PROBING)
- Don't just wait for them. PROMPT for missing info:
  - "I need the other vehicle's details. Point your camera at their plate." (Call 'draw_ar_marker' target: 'plate')
  - "Look for their Road Tax disc on the windscreen. I need to verify their insurance." (Call 'draw_ar_marker' target: 'road_tax')
  - "Describe the other driver's behavior. Are they being aggressive or cooperative?"
  - "Any witnesses nearby? Pan the camera to anyone standing around."

PHASE 3: 3RD PARTY MONITORING
- Listen for admissions of fault. If heard, IMMEDIATELY call 'log_evidence' with category 'OTHER_PARTY_ADMISSION'.
- If the other driver says "I didn't see you" or "Sorry", log it as a critical legal point.

PHASE 4: AR ANNOTATION
- Use 'draw_ar_marker' to guide the user. 
- Use 'holographic_overlay' to project data points (e.g., "Plate: WXA 1234 - Status: Active") onto the HUD.

MALAYSIAN PROTOCOL:
- Use localized context: 'JPJ', 'PDRM', 'Road Tax', 'Insurance Cover Note', 'Abang', 'Kakak'.
- Be firm but reassuring. You are their digital lawyer and bodyguard.`;

export const TOOLS = [
  {
    name: 'draw_ar_marker',
    parameters: {
      type: Type.OBJECT,
      description: 'Project high-contrast tactical brackets onto a specific target in the real world.',
      properties: {
        target: { type: Type.STRING, enum: ['plate', 'damage', 'road_tax', 'face', 'witness', 'hazards'] },
        label: { type: Type.STRING, description: 'Direct instruction for the user' }
      },
      required: ['target', 'label'],
    },
  },
  {
    name: 'holographic_overlay',
    parameters: {
      type: Type.OBJECT,
      description: 'Project a data-rich holographic panel onto the HUD with specific entity details.',
      properties: {
        title: { type: Type.STRING, description: 'Heading of the data panel' },
        data_points: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: 'List of facts gathered (e.g. Plate number, engine status)' 
        },
        severity: { type: Type.STRING, enum: ['INFO', 'CAUTION', 'CRITICAL'] }
      },
      required: ['title', 'data_points'],
    }
  },
  {
    name: 'log_evidence',
    parameters: {
      type: Type.OBJECT,
      description: 'Commit a specific interaction or visual finding to the permanent incident vault.',
      properties: {
        category: { type: Type.STRING, enum: ['PLATE', 'WITNESS_STMT', 'DAMAGE_REPORT', 'OTHER_PARTY_ADMISSION', 'VERBAL_TIMELINE', 'MEDICAL_STATUS'] },
        value: { type: Type.STRING, description: 'The core evidence text' },
        details: { type: Type.STRING, description: 'Contextual meta-data' }
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
    contents: `Vet car listing for fraud/lemons: ${url}`,
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
