import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env manually since we are in module mode
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '.env');
dotenv.config({ path: envPath });

console.log('Loading .env from:', envPath);

async function findWorkingModel() {
    const apiKey = process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ VITE_GEMINI_API_KEY not found in environment variables.");
        return;
    }
    console.log("🔑 API Key found, length:", apiKey.length);

    const ai = new GoogleGenAI({ apiKey });

    // List of models to test
    const modelsToTest = [
        'gemini-1.5-flash',
        'gemini-1.5-flash-001',
        'gemini-1.5-flash-002',
        'gemini-1.5-pro',
        'gemini-2.0-flash-exp'
    ];

    for (const modelName of modelsToTest) {
        try {
            console.log(`📡 Testing connection with '${modelName}'...`);
            const response = await ai.models.generateContent({
                model: modelName,
                contents: { parts: [{ text: "Hello, list 1 fruit." }] },
            });
            console.log(`✅ SUCCESS with ${modelName}!`);
            console.log(response?.candidates?.[0]?.content?.parts?.[0]?.text);
            // If one works, we are good, but let's test them all to see options
        } catch (error) {
            console.error(`❌ Error testing ${modelName}:`, error.message.split('\n')[0]);
        }
    }
}

findWorkingModel();
