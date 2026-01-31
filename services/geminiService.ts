
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DiagnosticResult, ScepticResult } from "../types";

const GUARDIAN_LIVE_PROMPT = `You are "J-Jaga Guardian," an elite emergency response agent for Malaysian roads. 
The user is in a state of panic after an accident.

PHASE 1: STABILIZE & LISTEN
1. Immediately greet: "J-Jaga Guardian online. I'm here. Take a deep breath. Tell me exactly what happened."
2. Analyze their response. If they mention "motorcycle," "rear-ended," or "multiple cars," acknowledge it immediately: "I understand, a rear-end collision. I'm starting the evidence protocol."

PHASE 2: GUIDED 3D AR INVESTIGATION
1. Use 'draw_ar_marker' to guide the camera. 
2. If scanning a plate: "Angle your phone to the rear plate."
3. If scanning damage: "Show me the impact zone on the motorcycle/car."
4. If witness is present: "Point the camera at the witness so I can record their statement."

PHASE 3: DOCUMENTATION
1. Use 'log_evidence' to save every detail: license plates, witness names, vehicle types, and time-stamped statements.
2. Tell the user: "I've logged the plate WXA 1234 to your vault."

TONE: Calm, authoritative, protective, using Standard English with a warm Malaysian touch.
LEGAL: Remind them: "Do not admit fault to the other party. I am recording everything for your protection."`;

export const TOOLS = [
  {
    name: 'draw_ar_marker',
    parameters: {
      type: Type.OBJECT,
      description: 'Highlight an object in 3D space on the HUD.',
      properties: {
        target: { type: Type.STRING, enum: ['plate', 'damage', 'motorcycle', 'witness', 'road_tax'] },
        label: { type: Type.STRING, description: 'Text label for the marker' },
        rotation: { type: Type.NUMBER, description: 'Degrees to tilt the box' }
      },
      required: ['target', 'label'],
    },
  },
  {
    name: 'log_evidence',
    parameters: {
      type: Type.OBJECT,
      description: 'Save extracted data to the Evidence Vault.',
      properties: {
        category: { type: Type.STRING, enum: ['PLATE', 'WITNESS', 'DAMAGE', 'TIMESTAMP'] },
        value: { type: Type.STRING },
        details: { type: Type.STRING }
      },
      required: ['category', 'value'],
    }
  }
];

// Fix: Exporting analyzeMechanic as requested by MechanicHUD.tsx
export const analyzeMechanic = async (audioData: string, quoteImage?: string): Promise<DiagnosticResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [
    { text: "Analyze this car engine sound and diagnostic quote (if provided). Identify the issue, confidence level (0.0 to 1.0), fraud risk (LOW/MEDIUM/HIGH), and a brief explanation." },
    { inlineData: { data: audioData, mimeType: 'audio/webm' } }
  ];
  if (quoteImage) {
    parts.push({ inlineData: { data: quoteImage.split(',')[1], mimeType: 'image/jpeg' } });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          issue: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          fraudRisk: { type: Type.STRING },
          explanation: { type: Type.STRING }
        },
        required: ["issue", "confidence", "fraudRisk", "explanation"]
      }
    }
  });

  try {
    const result = JSON.parse(response.text || '{}');
    return result as DiagnosticResult;
  } catch (e) {
    return {
      issue: "Analysis failed",
      confidence: 0,
      fraudRisk: 'LOW',
      explanation: "Could not parse model response."
    };
  }
};

// Fix: Exporting analyzeSceptic as requested by ScepticHUD.tsx
export const analyzeSceptic = async (url: string): Promise<ScepticResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Examine this car listing or video for potential mileage tampering or common 'lemon' indicators: ${url}. Provide a lemon score (0-100), flags, and a summary. Return result as JSON.`,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const text = response.text || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (e) {
    return {
      lemonScore: 50,
      flags: [],
      summary: "Manual review recommended. Could not extract structured data."
    };
  }
};

export function createLiveSession(callbacks: any) {
  // Fix: Initializing GoogleGenAI inside the function to ensure the correct API key is used.
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
