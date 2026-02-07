
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DiagnosticResult, ScepticResult } from "../types";

const GUARDIAN_LIVE_PROMPT = `You are "J-Jaga Guardian," an AI Incident Recorder & Assistant.

OPERATIONAL OBJECTIVE:
Your primary goal is to RECORD, ANALYZE, and then GUIDE. Do NOT deploy visual scanning tools immediately unless damage is obvious in the image or user requests it.

PHASE 1: IMMEDIATE ANALYSIS & LISTENING
- START by listening and analyzing the user's situation.
- Acknowledge their state: "Guardian active. Recording. Please state your status or describe the incident."
- LISTEN SENSITIVELY for keywords: "injured", "bleed", "hurt", "witness", "fault", "sorry".
- If the user mentions INJURIES (theirs or others), IMMEDIATELY use 'log_evidence' with category 'MEDICAL_STATUS'.
- If a 3rd party or witness speaks, use 'log_evidence' with category 'WITNESS_STMT' or 'OTHER_PARTY_ADMISSION'.

PHASE 2: DEPLOYING TOOLS (ONLY AFTER ASSESSMENT)
- Once you understand the situation (e.g., user says "I hit a car"), THEN guide them.
- "I'm deploying damage scanners. Please point the camera at the impact zone." -> Call 'draw_ar_marker' with target='damage'.
- "I need to log the other plate." -> Call 'draw_ar_marker' with target='plate'.

PHASE 3: CONTINUOUS LOGGING
- Continuously listen for changes in the story or new facts.
- Log every important detail using 'log_evidence'.

MALAYSIAN CONTEXT:
- Understand terms like 'Langgar', 'Saman', 'Road Tax', 'JPJ', 'Polis'.

CRITICAL RULE:
- Do NOT be chatty. Be efficient, calm, and professional.
- PRIORITIZE capturing injuries and 3rd party admissions over vehicle damage.`;

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
      description: 'Commit a specific interaction, injury report, or visual finding to the permanent incident vault with timestamp.',
      properties: {
        category: { type: Type.STRING, enum: ['PLATE', 'WITNESS_STMT', 'DAMAGE_REPORT', 'OTHER_PARTY_ADMISSION', 'VERBAL_TIMELINE', 'MEDICAL_STATUS'] },
        value: { type: Type.STRING, description: 'The core evidence text or statement' },
        details: { type: Type.STRING, description: 'Context: who said it, timestamp context, emotional state' }
      },
      required: ['category', 'value'],
    }
  }
];

export const analyzeMechanic = async (audioData: string, quoteImage?: string): Promise<DiagnosticResult> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });
  const parts: any[] = [
    { text: "Analyze engine sound and quote for fraud." },
    { inlineData: { data: audioData, mimeType: 'audio/webm' } }
  ];
  if (quoteImage) parts.push({ inlineData: { data: quoteImage.split(',')[1], mimeType: 'image/jpeg' } });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(response.text || '{}');
};

export const analyzeSceptic = async (url: string): Promise<ScepticResult> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Vet car listing for fraud/lemons: ${url}`,
    config: { tools: [{ googleSearch: {} }] }
  });
  const jsonMatch = response.text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
};

// Real-time streaming with Gemini API
let conversationHistory: any[] = [];
let lastImageAnalyzed: string | null = null;
let apiCallInProgress = false;
let hasSpokenWelcome = false;

const speakText = (text: string) => {
  console.log('🔊 Speaking:', text);
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  // Attempt to find a gentle female voice
  const voices = window.speechSynthesis.getVoices();
  const femaleVoice = voices.find(v => v.name.includes('Google US English'))
    || voices.find(v => v.name.includes('Microsoft Zira'))
    || voices.find(v => v.name.includes('Samantha'))
    || voices.find(v => v.name.toLowerCase().includes('female'));

  if (femaleVoice) {
    utterance.voice = femaleVoice;
  }

  // Gentle tone settings
  utterance.rate = 1.0;  // Normal speed (not rushed)
  utterance.pitch = 1.05; // Slightly higher/softer if possible
  utterance.volume = 1.0;

  window.speechSynthesis.speak(utterance);
};

export function createLiveSession(callbacks: any) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  console.log('🔑 API Key loaded:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING');

  if (!apiKey) {
    console.error('❌ VITE_GEMINI_API_KEY is not set!');
    callbacks.onerror?.(new Error('API key not configured'));
    return Promise.reject(new Error('API key not configured'));
  }

  const ai = new GoogleGenAI({ apiKey });
  console.log('🚀 Initializing Gemini session with vision + text streaming...');

  conversationHistory = [];
  hasSpokenWelcome = false;

  // Initialize session
  setTimeout(() => {
    console.log('✅ Session initialized');
    callbacks.onopen?.();

    // Welcome message (only once)
    if (!hasSpokenWelcome) {
      hasSpokenWelcome = true;
      const welcomeMsg = "Guardian active. Environmental recording started. Please describe your status.";
      speakText(welcomeMsg);
      callbacks.onmessage?.({
        serverContent: {
          outputTranscription: { text: welcomeMsg }
        }
      });

      conversationHistory.push({
        role: 'model',
        parts: [{ text: welcomeMsg }]
      });

      // Removed automatic AR marker - waiting for AI to decide
    }
  }, 500);

  const analyzeWithGemini = async (imageData: string, userText?: string) => {
    if (apiCallInProgress) {
      console.log('⏳ API call already in progress, skipping...');
      return;
    }
    apiCallInProgress = true;
    callbacks.onstatus?.('PROCESSING');

    console.log('🔄 Starting Gemini analysis...', { hasImage: !!imageData, hasText: !!userText });

    try {
      const parts: any[] = [];

      if (imageData && imageData !== lastImageAnalyzed) {
        console.log('📸 Adding image to analysis');
        parts.push({
          inlineData: {
            data: imageData.includes(',') ? imageData.split(',')[1] : imageData,
            mimeType: 'image/jpeg'
          }
        });
        lastImageAnalyzed = imageData;
      }

      if (userText) {
        console.log('💬 User text:', userText);
        parts.push({ text: userText });
        conversationHistory.push({
          role: 'user',
          parts: [{ text: userText }]
        });
      } else if (parts.length > 0) {
        parts.push({ text: "Analyze the scene. If you see damage or if the user mentioned an accident, deploy 'draw_ar_marker'." });
      }

      if (parts.length === 0) {
        console.log('⚠️ No content to analyze');
        apiCallInProgress = false;
        callbacks.onstatus?.('READY');
        return;
      }

      console.log('📡 Calling Gemini API...');

      // Gemini 3 models with fallback to 2.0
      const modelsToTry = [
        'gemini-3-flash-preview',
        'gemini-3-pro-preview',
        'gemini-2.0-flash'
      ];

      let response;
      let successModel = '';

      for (const modelName of modelsToTry) {
        try {
          console.log(`🔍 Trying model: ${modelName}`);

          // Retry logic for 429 errors
          let attempts = 0;
          const maxRetries = 3;

          while (attempts < maxRetries) {
            try {
              response = await ai.models.generateContent({
                model: modelName,
                contents: [{
                  role: 'user',
                  parts
                }],
                config: {
                  temperature: 0.7,
                  maxOutputTokens: 1024,
                  systemInstruction: { parts: [{ text: GUARDIAN_LIVE_PROMPT }] },
                  tools: [{ functionDeclarations: TOOLS }]
                }
              });
              break; // Success
            } catch (err: any) {
              if (err.message?.includes('429') && attempts < maxRetries - 1) {
                attempts++;
                const delay = 1000 * Math.pow(2, attempts);
                console.log(`⚠️ Rate limit (429) for ${modelName}, retrying in ${delay}ms...`);
                callbacks.onstatus?.(`RETRYING (${modelName} 429)...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
              throw err; // Re-throw if not 429 or retries exhausted
            }
          }

          successModel = modelName;
          console.log(`✅ Success with model: ${modelName}`);
          break;
        } catch (err: any) {
          console.log(`❌ Model ${modelName} failed: ${err?.message?.substring(0, 100)}`);
          if (modelName === modelsToTry[modelsToTry.length - 1]) {
            throw err; // Throw on last attempt
          }
        }
      }

      if (!response) {
        throw new Error('All models failed');
      }

      console.log('🤖 Gemini raw response:', response);

      // The response structure from the SDK
      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        console.warn('⚠️ No response candidates');
        apiCallInProgress = false;
        callbacks.onstatus?.('READY');
        return;
      }

      const candidate = candidates[0];
      const content = candidate.content;

      // Handle function calls
      if (content.parts) {
        for (const part of content.parts) {
          if (part.functionCall) {
            console.log('🔧 Function call:', part.functionCall);
            callbacks.onmessage?.({
              toolCall: {
                functionCalls: [{
                  id: Math.random().toString(36),
                  name: part.functionCall.name,
                  args: part.functionCall.args
                }]
              }
            });
          }

          // Handle text response
          if (part.text) {
            console.log('💬 AI response:', part.text);
            speakText(part.text);
            callbacks.onmessage?.({
              serverContent: {
                outputTranscription: { text: part.text }
              }
            });

            conversationHistory.push({
              role: 'model',
              parts: [{ text: part.text }]
            });
          }
        }
      }

    } catch (error: any) {
      console.error('❌ Gemini API error:', error);
      console.error('Error details:', error?.message, error?.stack);
      // Show error in UI
      const errorMsg = error?.message || 'API Error';
      callbacks.onstatus?.('ERROR');
      callbacks.onmessage?.({
        serverContent: {
          outputTranscription: { text: `Error: ${errorMsg}` }
        }
      });
      callbacks.onerror?.(error);
    } finally {
      apiCallInProgress = false;
      if (conversationHistory.length > 0) callbacks.onstatus?.('READY');
      console.log('✅ API call completed');
    }
  };

  let imageQueue: string[] = [];
  let isProcessingImage = false;

  const processImageQueue = async () => {
    if (isProcessingImage || imageQueue.length === 0) return;

    isProcessingImage = true;
    const image = imageQueue.shift();
    if (image) {
      await analyzeWithGemini(image);
    }
    isProcessingImage = false;

    if (imageQueue.length > 0) {
      setTimeout(processImageQueue, 3000); // Process next image after 3s
    }
  };

  return Promise.resolve({
    sendRealtimeInput: async (input: any) => {
      console.log('📤 Sending input:', input.text || (input.media?.mimeType || 'data'));

      if (input.text) {
        // User text input
        callbacks.onmessage?.({
          serverContent: {
            inputTranscription: { text: input.text }
          }
        });

        await analyzeWithGemini(lastImageAnalyzed || '', input.text);
      } else if (input.media?.mimeType?.includes('image')) {
        // Queue images for analysis (throttled)
        imageQueue.push(input.media.data);
        if (imageQueue.length === 1) {
          setTimeout(processImageQueue, 2000); // Start processing after 2s
        }
      }
    },
    sendToolResponse: (response: any) => {
      console.log('🔧 Tool response sent:', response);
    }
  });
}
