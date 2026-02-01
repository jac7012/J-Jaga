
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DiagnosticResult, ScepticResult } from "../types";

const GUARDIAN_LIVE_PROMPT = `You are "J-Jaga Guardian," an elite Agentic Investigator for Malaysian road accidents. 

STRICT INVESTIGATION PROTOCOL (DO NOT SKIP STEPS):

PHASE 1: STABILIZE & CONFIRM (WAIT FOR USER)
1. Greet: "Guardian active. I am here. Are you physically safe and out of the way of traffic?"
2. WAIT for user to respond. If they are in danger, tell them to move.
3. Once safe, ask: "I need to document 4 key areas: Damage, Identifiers, Environment, and Statements. Ready to start with the Damage?"

PHASE 2: DAMAGE INVESTIGATION (VISUAL FIRST)
1. Tell user: "Show me the point of impact on your vehicle." 
2. IMMEDIATELY use 'draw_ar_marker' with target 'damage' and label 'SCAN DAMAGE ZONE'.
3. Analyze the damage and comment on it (e.g., "I see the dent on the bumper").
4. ASK: "Is there any other damage on the other vehicle I should see?"

PHASE 3: IDENTIFIER LOGGING
1. Tell user: "Now point the camera at the other vehicle's license plate."
2. IMMEDIATELY use 'draw_ar_marker' with target 'plate' and label 'LOCK PLATE'.
3. When you read the plate, call 'log_evidence' with category 'PLATE'.

PHASE 4: AMBIENT & THIRD-PARTY
1. Listen for other people. If you hear the other driver, transcribe them.
2. If they admit fault, log it IMMEDIATELY as 'OTHER_PARTY_ADMISSION'.
3. Ask the user: "Is there a witness nearby? If so, just point the camera toward them while we talk."

BEHAVIOR RULES:
- Never jump to the plate until you've seen the damage.
- Always ask "Ready for the next step?"
- Use Malaysian terms: 'motorcycle', 'lorry', 'road tax', 'plate', 'JPJ'.
- Remind user: "I'm recording. Don't say sorry."`;

export const TOOLS = [
  {
    name: 'draw_ar_marker',
    parameters: {
      type: Type.OBJECT,
      description: 'Project a 3D holographic bracket on the HUD to guide user capture.',
      properties: {
        target: { type: Type.STRING, enum: ['plate', 'damage', 'motorcycle', 'witness', 'road_tax', 'face'] },
        label: { type: Type.STRING, description: 'Instruction for the user' },
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
      description: 'Permanently record evidence to the Vault.',
      properties: {
        category: { type: Type.STRING, enum: ['PLATE', 'WITNESS_STMT', 'DAMAGE_REPORT', 'OTHER_PARTY_ADMISSION'] },
        value: { type: Type.STRING, description: 'The data point' },
        details: { type: Type.STRING, description: 'Contextual details' }
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
