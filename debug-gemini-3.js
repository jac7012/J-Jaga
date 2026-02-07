import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '.env');
dotenv.config({ path: envPath });

async function debugGemini3() {
    const apiKey = process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ VITE_GEMINI_API_KEY not found.");
        return;
    }

    const ai = new GoogleGenAI({ apiKey });

    // Testing both models
    const models = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.0-flash'];

    for (const modelName of models) {
        console.log(`\n📡 Testing ${modelName} with simple prompt...`);
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: { parts: [{ text: "Hello, reply 'OK' if you can read this." }] },
            }); // Removed config to test bare minimum

            const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
            console.log(`✅ ${modelName} SUCCESS: ${text}`);
            // If one works, we can stop or continue
        } catch (e) {
            console.error(`❌ ${modelName} FAILED:`, e.message?.split('\n')[0]);
            if (e.message.includes('429')) {
                console.error("   (Rate Limit Exceeded)");
            }
        }
    }
}

debugGemini3();
