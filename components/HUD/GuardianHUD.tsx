
import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, ShieldCheck, AlertTriangle, ArrowLeft, Mic, UserRound } from 'lucide-react';
import { createLiveSession } from '../../services/geminiService';

interface GuardianHUDProps {
  onBack: () => void;
}

const GuardianHUD: React.FC<GuardianHUDProps> = ({ onBack }) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<any>(null);
  const [arMarker, setArMarker] = useState<{ target: string; label: string } | null>(null);
  const [isWitnessMode, setIsWitnessMode] = useState(false);
  const [comfortText, setComfortText] = useState("Connecting to your Guardian...");

  // Audio Context for Playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);

  const decodeAudio = async (base64: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    const dataInt16 = new Int16Array(bytes.buffer);
    const buffer = audioContextRef.current.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
    
    return buffer;
  };

  const playAudio = async (base64: string) => {
    const buffer = await decodeAudio(base64);
    const source = audioContextRef.current!.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current!.destination);
    
    const startTime = Math.max(nextStartTimeRef.current, audioContextRef.current!.currentTime);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;
  };

  useEffect(() => {
    const sessionPromise = createLiveSession({
      onopen: () => setComfortText("I'm here. I'm with you."),
      onmessage: async (msg: any) => {
        if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
          playAudio(msg.serverContent.modelTurn.parts[0].inlineData.data);
        }
        if (msg.toolCall) {
          for (const fc of msg.toolCall.functionCalls) {
            if (fc.name === 'draw_ar_marker') {
              setArMarker(fc.args);
              setTimeout(() => setArMarker(null), 5000);
            }
          }
        }
      },
    });

    sessionPromise.then(setSession);
    return () => sessionPromise.then(s => s.close());
  }, []);

  // Stream Video Frames
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const frame = webcamRef.current?.getScreenshot();
      if (frame) {
        session.sendRealtimeInput({
          media: { data: frame.split(',')[1], mimeType: 'image/jpeg' }
        });
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
      <Webcam
        ref={webcamRef}
        audio={false}
        screenshotFormat="image/jpeg"
        videoConstraints={{ facingMode: "environment" }}
        className="absolute inset-0 w-full h-full object-cover opacity-60"
      />

      {/* AR Overlay Layer */}
      <AnimatePresence>
        {arMarker && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="w-64 h-64 border-4 border-cyan-400 rounded-3xl relative shadow-[0_0_50px_rgba(34,211,238,0.5)]">
               <div className="absolute -top-12 left-0 bg-cyan-500 text-black px-4 py-1 rounded-full font-black text-xs mono uppercase">
                  DETECTED: {arMarker.label}
               </div>
               <motion.div 
                 animate={{ opacity: [0.2, 1, 0.2] }}
                 transition={{ repeat: Infinity, duration: 1 }}
                 className="absolute inset-0 bg-cyan-400/10" 
               />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD Content */}
      <div className="relative z-10 flex flex-col h-full p-6">
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 neon-red" />
              <span className="mono font-black text-xl text-red-500">GUARDIAN_MODE</span>
            </div>
            <div className="glass px-3 py-1 rounded-full border-red-500/30 w-fit">
              <span className="text-[10px] mono text-red-400 animate-pulse uppercase tracking-widest">Live Voice Agent Active</span>
            </div>
          </div>
          <button onClick={onBack} className="p-3 glass rounded-full border-white/10">
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Comfort/Guidance Area */}
        <div className="mt-auto mb-32">
           <div className="bg-red-600 text-white font-black text-3xl py-3 px-6 uppercase skew-x-[-10deg] mb-6 shadow-2xl inline-block">
             Do Not Admit Fault
           </div>
           
           <motion.div 
             key={comfortText}
             initial={{ opacity: 0, x: -20 }}
             animate={{ opacity: 1, x: 0 }}
             className="glass p-8 rounded-[2.5rem] border-neon-cyan relative overflow-hidden"
           >
              <div className="absolute top-0 right-0 p-4">
                 <Mic className="w-5 h-5 text-cyan-400 animate-bounce" />
              </div>
              <span className="mono text-[10px] text-cyan-400 uppercase tracking-[0.3em] mb-2 block">Voice Guidance</span>
              <p className="text-2xl font-semibold leading-tight text-white/90 italic">
                "{comfortText}"
              </p>
           </motion.div>
        </div>

        {/* Action HUD */}
        <div className="grid grid-cols-2 gap-4 mb-8">
           <button 
             onClick={() => setIsWitnessMode(!isWitnessMode)}
             className={`glass p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${isWitnessMode ? 'border-orange-500 bg-orange-500/20' : 'border-white/5'}`}
           >
              <UserRound className={`w-8 h-8 ${isWitnessMode ? 'text-orange-400' : 'text-white/20'}`} />
              <span className="text-[10px] mono uppercase opacity-60">Witness Testimony</span>
           </button>
           <div className="glass p-6 rounded-3xl border-white/5 flex flex-col items-center justify-center gap-2">
              <ShieldCheck className="w-8 h-8 text-green-500" />
              <span className="text-[10px] mono uppercase opacity-60">Secure Cloud Sync</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default GuardianHUD;
