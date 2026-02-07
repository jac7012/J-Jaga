import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '.env');
dotenv.config({ path: envPath });

async function listAllModels() {
    const apiKey = process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ VITE_GEMINI_API_KEY not found.");
        return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            console.log("✅ Available Models:");
            data.models.forEach(model => {
                console.log(`- ${model.name.replace('models/', '')} (${model.supportedGenerationMethods.join(', ')})`);
            });
        } else {
            console.error("❌ Failed to list models:", data);
        }
    } catch (error) {
        console.error("❌ Error fetching models:", error);
    }
}

listAllModels();
