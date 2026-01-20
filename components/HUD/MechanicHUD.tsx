
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Upload, FileSearch, CheckCircle, RotateCcw } from 'lucide-react';
import WaveformViz from '../Visualizers/WaveformViz';
import { analyzeMechanic } from '../../services/geminiService';
import { DiagnosticResult } from '../../types';

interface MechanicHUDProps {
  onBack: () => void;
}

const MechanicHUD: React.FC<MechanicHUDProps> = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [quoteImage, setQuoteImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          await runAnalysis(base64Audio);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic access denied", err);
      alert("Microphone access is required for The Mechanic.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const runAnalysis = async (audioData: string) => {
    setAnalyzing(true);
    try {
      const res = await analyzeMechanic(audioData, quoteImage || undefined);
      setResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setQuoteImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-2xl font-black italic mono uppercase tracking-tighter neon-cyan">The Mechanic</h2>
          <p className="text-xs text-white/50 mono">OSCILLOSCOPE & FRAUD DETECTION</p>
        </div>
        <div className="flex items-center gap-2 glass px-3 py-1 rounded-full border-white/10">
          <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-white/20'}`} />
          <span className="text-[10px] mono uppercase">{isRecording ? 'Listening' : 'Ready'}</span>
        </div>
      </div>

      <div className="glass rounded-3xl p-6 border-white/5 relative overflow-hidden flex flex-col items-center justify-center min-h-[250px]">
        {result ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full text-center space-y-4 z-10">
            <div className={`text-4xl font-black uppercase ${result.fraudRisk === 'HIGH' ? 'text-red-500' : 'text-cyan-400'}`}>
              {result.issue}
            </div>
            <div className="flex justify-center gap-8">
              <div className="flex flex-col">
                <span className="mono text-[10px] opacity-50">CONFIDENCE</span>
                <span className="text-xl font-bold">{(result.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="flex flex-col">
                <span className="mono text-[10px] opacity-50">FRAUD RISK</span>
                <span className={`text-xl font-bold ${result.fraudRisk === 'HIGH' ? 'text-red-500' : 'text-green-500'}`}>
                  {result.fraudRisk}
                </span>
              </div>
            </div>
            <p className="text-sm text-white/70 max-w-xs mx-auto">{result.explanation}</p>
            <button onClick={() => setResult(null)} className="flex items-center gap-2 mx-auto px-4 py-2 glass rounded-xl border-white/10 text-xs mono">
              <RotateCcw className="w-4 h-4" /> RE-SCAN
            </button>
          </motion.div>
        ) : (
          <WaveformViz isRecording={isRecording} color={isRecording ? "#22d3ee" : "#1e293b"} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] mono uppercase text-white/50">Quote Upload</span>
          </div>
          <label className="cursor-pointer group">
            <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" />
            <div className="border border-dashed border-white/20 rounded-xl p-4 text-center">
              {quoteImage ? <CheckCircle className="w-6 h-6 mx-auto text-green-500" /> : <Upload className="w-6 h-6 mx-auto opacity-20" />}
              <span className="block text-[10px] mt-2 mono opacity-50">PDF/JPG</span>
            </div>
          </label>
        </div>

        <div className="glass rounded-2xl p-4 flex flex-col gap-3 justify-center items-center">
          <button 
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all ${
              isRecording ? 'border-red-500 bg-red-500/20 scale-110 shadow-2xl' : 'border-cyan-500/50 bg-cyan-500/10'
            }`}
          >
            {analyzing ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Mic className="w-8 h-8 text-cyan-400" />}
          </button>
          <span className="text-[10px] mono uppercase text-white/30">Hold to Listen</span>
        </div>
      </div>
    </div>
  );
};

export default MechanicHUD;
