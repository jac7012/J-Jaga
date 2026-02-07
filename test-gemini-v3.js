import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '.env');
dotenv.config({ path: envPath });

async function testGemini3() {
    const apiKey = process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ VITE_GEMINI_API_KEY not found.");
        return;
    }

    const ai = new GoogleGenAI({ apiKey });

    const models = [
        'gemini-3-flash-preview',
        'gemini-3-pro-preview',
        'gemini-2.0-flash-exp'
    ];

    for (const modelName of models) {
        console.log(`\n📡 Testing ${modelName}...`);
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: { parts: [{ text: "Hello, reply with 'Connected'" }] },
            });
            console.log(`✅ ${modelName} SUCCESS:`, response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
        } catch (e) {
            console.error(`❌ ${modelName} FAILED:`, e.message?.split('\n')[0]);
        }
    }
}

testGemini3();
