
import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, ShieldCheck, ArrowLeft, Mic, UserRound, MessageSquare } from 'lucide-react';
import { createLiveSession } from '../../services/geminiService';

// --- Manual Encoding/Decoding Helpers ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

interface GuardianHUDProps {
  onBack: () => void;
}

const GuardianHUD: React.FC<GuardianHUDProps> = ({ onBack }) => {
  const webcamRef = useRef<Webcam>(null);
  const [session, setSession] = useState<any>(null);
  const [arMarker, setArMarker] = useState<{ target: string; label: string } | null>(null);
  const [transcription, setTranscription] = useState({ user: "", ai: "" });
  const [isWitnessMode, setIsWitnessMode] = useState(false);

  const audioOutContextRef = useRef<AudioContext | null>(null);
  const audioInContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  useEffect(() => {
    // 1. Setup Audio Out
    audioOutContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    // 2. Setup Session
    sessionPromiseRef.current = createLiveSession({
      onopen: () => {
        console.log("Guardian session opened.");
        setupMicrophone();
      },
      onmessage: async (msg: any) => {
        // Handle Audio Playback
        const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (base64Audio && audioOutContextRef.current) {
          const buffer = await decodeAudioData(decode(base64Audio), audioOutContextRef.current, 24000, 1);
          const source = audioOutContextRef.current.createBufferSource();
          source.buffer = buffer;
          source.connect(audioOutContextRef.current.destination);
          const startTime = Math.max(nextStartTimeRef.current, audioOutContextRef.current.currentTime);
          source.start(startTime);
          nextStartTimeRef.current = startTime + buffer.duration;
        }

        // Handle Transcriptions
        if (msg.serverContent?.inputTranscription) {
          setTranscription(prev => ({ ...prev, user: msg.serverContent.inputTranscription.text }));
        }
        if (msg.serverContent?.outputTranscription) {
          setTranscription(prev => ({ ...prev, ai: msg.serverContent.outputTranscription.text }));
        }

        // Handle Tool Calls (AR)
        if (msg.toolCall) {
          for (const fc of msg.toolCall.functionCalls) {
            if (fc.name === 'draw_ar_marker') {
              setArMarker(fc.args);
              setTimeout(() => setArMarker(null), 8000);
              sessionPromiseRef.current?.then(s => s.sendToolResponse({
                functionResponses: [{ id: fc.id, name: fc.name, response: { result: "ok" } }]
              }));
            }
          }
        }
      },
      onerror: (e: any) => console.error("Live Error:", e),
      onclose: () => console.log("Guardian Session Closed")
    });

    sessionPromiseRef.current.then(setSession);

    return () => {
      sessionPromiseRef.current?.then(s => s.close());
      audioOutContextRef.current?.close();
      audioInContextRef.current?.close();
    };
  }, []);

  const setupMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioInContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = audioInContextRef.current.createMediaStreamSource(stream);
      const processor = audioInContextRef.current.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const l = inputData.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
        
        sessionPromiseRef.current?.then(s => {
          s.sendRealtimeInput({
            media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' }
          });
        });
      };

      source.connect(processor);
      processor.connect(audioInContextRef.current.destination);
    } catch (err) {
      console.error("Mic Error:", err);
    }
  };

  // Video Stream Logic
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const frame = webcamRef.current?.getScreenshot();
      if (frame) {
        session.sendRealtimeInput({
          media: { data: frame.split(',')[1], mimeType: 'image/jpeg' }
        });
      }
    }, 1000); // 1 FPS for efficiency
    return () => clearInterval(interval);
  }, [session]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden select-none">
      <Webcam
        ref={webcamRef}
        audio={false}
        screenshotFormat="image/jpeg"
        videoConstraints={{ facingMode: "environment", width: 1280, height: 720 }}
        className="absolute inset-0 w-full h-full object-cover opacity-70"
      />

      {/* Dynamic AR Markers */}
      <AnimatePresence>
        {arMarker && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="w-72 h-72 border-[4px] border-cyan-400 rounded-[2rem] relative shadow-[0_0_80px_rgba(34,211,238,0.6)]">
               <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-cyan-400 text-black px-6 py-2 rounded-full font-black text-sm mono uppercase shadow-xl whitespace-nowrap">
                  {arMarker.label}
               </div>
               <motion.div 
                 animate={{ opacity: [0.1, 0.4, 0.1], scale: [1, 1.05, 1] }}
                 transition={{ repeat: Infinity, duration: 1.5 }}
                 className="absolute inset-0 bg-cyan-400/20 rounded-[2rem]" 
               />
               <div className="absolute inset-0 border border-white/20 animate-pulse rounded-[2rem]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD Layer */}
      <div className="relative z-10 flex flex-col h-full p-6 bg-gradient-to-b from-black/40 via-transparent to-black/60">
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 neon-red" />
              <span className="mono font-black text-xl text-red-500 tracking-tighter">GUARDIAN_LIVE</span>
            </div>
            <div className="glass px-3 py-1 rounded-full border-red-500/30 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] mono text-red-400 uppercase tracking-widest">Aura Sync: Zephyr-01</span>
            </div>
          </div>
          <button onClick={onBack} className="p-3 glass rounded-full border-white/10 hover:bg-white/5 transition-colors">
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Subtitles & Transcription Display */}
        <div className="mt-auto mb-24 space-y-4">
          <AnimatePresence>
            {transcription.user && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 justify-end"
              >
                <div className="glass-light bg-white/10 px-4 py-2 rounded-2xl rounded-tr-none text-right max-w-[70%]">
                  <span className="mono text-[8px] text-white/40 block mb-1 uppercase">User Voice</span>
                  <p className="text-sm text-white font-medium">{transcription.user}</p>
                </div>
                <div className="p-2 glass rounded-full shrink-0"><Mic className="w-4 h-4 text-white/50" /></div>
              </motion.div>
            )}

            {transcription.ai && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3"
              >
                <div className="p-2 glass rounded-full shrink-0 bg-cyan-500/20 border-cyan-500/50">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="glass bg-cyan-950/40 border-cyan-500/30 px-6 py-4 rounded-3xl rounded-tl-none max-w-[85%] shadow-2xl">
                  <span className="mono text-[8px] text-cyan-400 block mb-1 uppercase tracking-widest">Guardian Input</span>
                  <p className="text-lg font-semibold leading-tight text-cyan-50 text-shadow-sm italic">
                    {transcription.ai}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* HUD Controls */}
        <div className="grid grid-cols-2 gap-4 mb-8">
           <button 
             onClick={() => setIsWitnessMode(!isWitnessMode)}
             className={`glass p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 relative overflow-hidden group ${isWitnessMode ? 'border-orange-500 bg-orange-500/20' : 'border-white/5'}`}
           >
              <UserRound className={`w-8 h-8 transition-colors ${isWitnessMode ? 'text-orange-400' : 'text-white/20'}`} />
              <span className="text-[10px] mono uppercase opacity-60 tracking-tighter">Witness Focus</span>
              {isWitnessMode && <div className="absolute inset-0 bg-orange-500/5 animate-pulse" />}
           </button>
           <div className="glass p-6 rounded-3xl border-white/5 flex flex-col items-center justify-center gap-2">
              <ShieldCheck className="w-8 h-8 text-green-500" />
              <span className="text-[10px] mono uppercase opacity-60 tracking-tighter">Evidence Secure</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default GuardianHUD;
