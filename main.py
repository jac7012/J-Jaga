
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import os

app = FastAPI(title="J-Jaga Backend")

class DiagnosticRequest(BaseModel):
    audio_description: str
    quote_data: Optional[str] = None

class LemonScoreRequest(BaseModel):
    video_url: str

# System Instructions
MECHANIC_SYS = "You are a mechanical diagnostic expert. Detect anomalies in engine sound and cross-reference with provided repair quotes."
SCEPTIC_SYS = "You are a car vetting agent. Watch video feeds for 'Blue Smoke' or 'Uneven Idle'. Assign a Lemon Score 0-100."
GUARDIAN_SYS = "You are a Malaysian road safety agent. Context: Act 1987. Analyze accident photos for plates and road tax. Command user clearly."

@app.post("/mechanic/analyze")
async def analyze_mechanic(request: DiagnosticRequest):
    # This would call the Gemini 3 API (Python SDK)
    # Using 'gemini-3-flash-preview' for rapid multi-modal reasoning
    return {
        "issue": "Piston Slap / Worn Rings",
        "fraud_risk": "HIGH",
        "explanation": "Audio physics show 300Hz knock. Quote suggests 'Air Filter', which is fraudulent."
    }

@app.post("/sceptic/vet")
async def vet_car(request: LemonScoreRequest):
    return {
        "lemon_score": 72,
        "flags": [
            {"ts": "0:14", "issue": "Blue Smoke on Cold Start", "severity": "high"},
            {"ts": "1:02", "issue": "Radiator Support Spray Paint Over", "severity": "medium"}
        ]
    }

@app.post("/guardian/frame")
async def process_guardian_frame(file: UploadFile = File(...)):
    # Perform Vision analysis using Gemini 3
    return {
        "instruction": "Walk closer to the Silver Perodua. Frame the plate.",
        "entities": ["Plate: WXA 1234", "Road Tax: Valid Dec 2024"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
