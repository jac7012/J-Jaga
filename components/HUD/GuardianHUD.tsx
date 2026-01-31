
import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldAlert, 
  ArrowLeft, 
  Mic, 
  Scan, 
  ClipboardList, 
  Layers, 
  Info,
  ChevronRight,
  AlertTriangle,
  History,
  Lock
} from 'lucide-react';
import { createLiveSession } from '../../services/geminiService';

// --- PCM Encoding/Decoding ---
function decode(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
  return buffer;
}

interface EvidenceItem {
  id: string;
  category: string;
  value: string;
  time: string;
}

const GuardianHUD: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const webcamRef = useRef<Webcam>(null);
  const [session, setSession] = useState<any>(null);
  const [arMarker, setArMarker] = useState<any>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [subs, setSubs] = useState({ user: "", ai: "" });
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const audioOutContext = useRef<AudioContext | null>(null);
  const audioInContext = useRef<AudioContext | null>(null);
  const nextStartTime = useRef(0);
  const sessionPromise = useRef<Promise<any> | null>(null);

  const setupMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!audioInContext.current) return;

      const source = audioInContext.current.createMediaStreamSource(stream);
      const processor = audioInContext.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) int16[i] = input[i] * 32768;
        sessionPromise.current?.then(s => s.sendRealtimeInput({
          media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' }
        }));
      };
      
      source.connect(processor);
      processor.connect(audioInContext.current.destination);
    } catch (err: any) {
      console.error("Mic access denied", err);
      setErrorMsg("Microphone access denied. Please enable it in your browser settings.");
    }
  };

  // User-gesture handler to safely initialize Audio and Mic
  const handleStartProtocol = useCallback(async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (isReady) return;
    
    try {
      // 1. Initialize Audio Contexts within user gesture
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioOutContext.current = new AudioCtx({ sampleRate: 24000 });
      audioInContext.current = new AudioCtx({ sampleRate: 16000 });
      
      // 2. Explicitly resume to satisfy browser autoplay policies
      await audioOutContext.current.resume();
      await audioInContext.current.resume();

      // 3. Request permissions immediately
      await setupMicrophone();

      // 4. Create session
      sessionPromise.current = createLiveSession({
        onopen: () => {
          console.log("Guardian session connected.");
          setErrorMsg(null);
        },
        onmessage: async (msg: any) => {
          // Audio Output from Gemini
          const data = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (data && audioOutContext.current) {
            const buffer = await decodeAudioData(decode(data), audioOutContext.current, 24000);
            const source = audioOutContext.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioOutContext.current.destination);
            const start = Math.max(nextStartTime.current, audioOutContext.current.currentTime);
            source.start(start);
            nextStartTime.current = start + buffer.duration;
          }

          // Transcriptions
          if (msg.serverContent?.inputTranscription) setSubs(prev => ({ ...prev, user: msg.serverContent.inputTranscription.text }));
          if (msg.serverContent?.outputTranscription) setSubs(prev => ({ ...prev, ai: msg.serverContent.outputTranscription.text }));

          // Tooling Logic (AR and Logging)
          if (msg.toolCall) {
            for (const fc of msg.toolCall.functionCalls) {
              if (fc.name === 'draw_ar_marker') {
                setArMarker(fc.args);
                setTimeout(() => setArMarker(null), 10000);
              }
              if (fc.name === 'log_evidence') {
                setEvidence(prev => [{
                  id: Math.random().toString(),
                  category: fc.args.category,
                  value: fc.args.value,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }, ...prev]);
                setIsVaultOpen(true);
              }
              sessionPromise.current?.then(s => s.sendToolResponse({
                functionResponses: [{ id: fc.id, name: fc.name, response: { status: "logged" } }]
              }));
            }
          }
        },
        onerror: (err: any) => {
          console.error("Live session error", err);
          setErrorMsg("Guardian link interrupted. Retrying...");
        },
        onclose: () => {
          console.log("Guardian link closed.");
        }
      });

      sessionPromise.current.then(setSession);
      setIsReady(true);
    } catch (err) {
      console.error("Protocol initialization failed", err);
      setErrorMsg("Failed to start protocol. Check device permissions.");
    }
  }, [isReady]);

  // Visual frame stream
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const frame = webcamRef.current?.getScreenshot();
      if (frame) {
        session.sendRealtimeInput({ media: { data: frame.split(',')[1], mimeType: 'image/jpeg' } });
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden text-white safe-area-inset">
      <Webcam 
        ref={webcamRef} 
        audio={false} 
        screenshotFormat="image/jpeg" 
        videoConstraints={{ facingMode: "environment", width: 1280, height: 720 }} 
        className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
        onUserMediaError={() => setErrorMsg("Camera access denied.")}
      />

      {/* Permission & Start Overlay */}
      {!isReady && (
        <div className="absolute inset-0 z-50 glass flex flex-col items-center justify-center p-8 text-center bg-black/80 backdrop-blur-xl">
          <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="mb-8">
            <div className="relative">
              <ShieldAlert className="w-24 h-24 text-red-500 relative z-10" />
              <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full" />
            </div>
          </motion.div>
          <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-4 text-white">Initialize Guardian</h2>
          <p className="text-white/60 text-sm mb-10 max-w-xs mx-auto">
            Guardian Mode requires real-time camera and microphone access to document the incident and provide guidance.
          </p>
          
          {errorMsg && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 flex items-center gap-2 text-red-400 bg-red-500/10 px-4 py-2 rounded-xl border border-red-500/20">
              <Lock className="w-4 h-4" />
              <span className="text-xs font-bold">{errorMsg}</span>
            </motion.div>
          )}

          <button 
            onClick={handleStartProtocol}
            className="px-10 py-5 bg-red-600 hover:bg-red-500 active:scale-95 transition-all rounded-[2rem] font-black text-xl shadow-[0_20px_40px_rgba(220,38,38,0.4)] border-b-4 border-red-800"
          >
            START PROTOCOL
          </button>
        </div>
      )}

      {/* HUD Content (Only visible after init) */}
      {isReady && (
        <>
          {/* AR GUIDANCE OVERLAYS */}
          <AnimatePresence>
            {arMarker && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 1.1 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                style={{ perspective: '1200px' }}
              >
                <div className="relative w-80 h-80 border-2 border-cyan-400/40 rounded-[3rem]" style={{ transform: `rotateY(${arMarker.rotation || 0}deg)` }}>
                   <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-cyan-400" />
                   <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-cyan-400" />
                   <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-cyan-400" />
                   <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-cyan-400" />
                   
                   <motion.div 
                     animate={{ opacity: [0.1, 0.4, 0.1] }} 
                     transition={{ repeat: Infinity, duration: 1.5 }} 
                     className="absolute inset-6 bg-cyan-400/5 rounded-[2.5rem] flex items-center justify-center"
                   >
                     <Scan className="w-16 h-16 text-cyan-400/50 animate-pulse" />
                   </motion.div>

                   <div className="absolute -top-14 left-0 right-0 flex justify-center">
                     <span className="bg-cyan-500 text-black px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-2xl border border-white/20">
                       LOCK: {arMarker.label}
                     </span>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* TOP CONTROL BAR */}
          <div className="relative z-30 flex justify-between items-start p-6 pt-14">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <h1 className="text-2xl font-black tracking-tighter italic text-red-500 text-shadow-lg">GUARDIAN_HUD</h1>
              </div>
              <span className="text-[10px] mono text-white/40 uppercase mt-1 tracking-[0.2em]">Protocol Active // Encrypted Channel</span>
            </div>
            <button onClick={onBack} className="glass p-4 rounded-full border-white/10 active:scale-90 transition-all shadow-xl">
              <ArrowLeft className="w-6 h-6" />
            </button>
          </div>

          {/* SIDEBAR - EVIDENCE VAULT */}
          <motion.div 
            initial={false}
            animate={{ x: isVaultOpen ? 0 : 'calc(100% - 30px)' }}
            className="absolute top-36 right-0 bottom-64 w-64 glass rounded-l-[2.5rem] border-l border-white/10 z-40 shadow-2xl transition-all"
          >
            <button 
              onClick={(e) => { e.stopPropagation(); setIsVaultOpen(!isVaultOpen); }}
              className="absolute left-0 top-1/2 -translate-y-1/2 p-3 bg-red-600 text-white rounded-r-xl shadow-lg"
            >
              <ChevronRight className={`w-5 h-5 transition-transform ${isVaultOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className="p-6 flex flex-col h-full overflow-hidden">
              <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-3">
                <ClipboardList className="w-5 h-5 text-cyan-400" />
                <span className="text-xs font-black mono uppercase tracking-widest">Incident Log</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 no-scrollbar pr-1">
                {evidence.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 text-center p-4 italic">
                    <Layers className="w-10 h-10 mb-4" />
                    <span className="text-[10px] mono uppercase">Waiting for extraction...</span>
                  </div>
                ) : (
                  evidence.map(item => (
                    <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} key={item.id} className="bg-white/5 border-l-4 border-cyan-500 p-4 rounded-r-2xl shadow-inner">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] mono text-cyan-400 font-black">{item.category}</span>
                        <span className="text-[9px] mono text-white/20">{item.time}</span>
                      </div>
                      <p className="text-sm font-black uppercase leading-tight tracking-tight">{item.value}</p>
                    </motion.div>
                  ))
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2 opacity-30">
                <Info className="w-4 h-4" />
                <span className="text-[9px] mono uppercase">Timestamp Evidence Ready</span>
              </div>
            </div>
          </motion.div>

          {/* SUBTITLES SYSTEM */}
          <div className="mt-auto p-6 mb-32 z-30 space-y-4">
            <AnimatePresence>
              {subs.user && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex justify-end">
                  <div className="glass-light bg-white/10 border border-white/5 px-5 py-3 rounded-2xl rounded-tr-none text-right max-w-[85%] shadow-xl">
                    <span className="text-[9px] mono text-white/30 block mb-1 uppercase tracking-widest font-black">Environmental Input</span>
                    <p className="text-sm font-medium text-white/90 italic leading-relaxed">"{subs.user}"</p>
                  </div>
                </motion.div>
              )}
              {subs.ai && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full glass border border-red-500/50 flex items-center justify-center shrink-0 shadow-lg">
                    <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1 }} className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]" />
                  </div>
                  <div className="glass bg-red-950/20 border-red-500/30 px-6 py-5 rounded-3xl rounded-tl-none max-w-[88%] shadow-2xl backdrop-blur-md">
                    <span className="text-[9px] mono text-red-400 font-black block mb-1 uppercase tracking-widest">J-Jaga Response</span>
                    <p className="text-xl font-black leading-tight text-white drop-shadow-xl italic tracking-tight">
                      {subs.ai}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* EMERGENCY FOOTER HUD */}
          <div className="absolute bottom-0 inset-x-0 glass border-t border-white/10 bg-black/90 z-40 p-6 pb-12 flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
             <div className="flex flex-col">
                <div className="flex items-center gap-2">
                   <AlertTriangle className="w-5 h-5 text-yellow-500" />
                   <span className="text-sm font-black uppercase text-yellow-500 tracking-widest italic">Safety Protocol</span>
                </div>
                <p className="text-[11px] mono text-white/50 mt-1 uppercase">Stay safe // Data being preserved</p>
             </div>
             <div className="flex gap-4">
                <button className="w-16 h-16 rounded-2xl glass border-white/10 flex items-center justify-center active:bg-white/10 transition-colors shadow-lg group">
                   <History className="w-7 h-7 opacity-40 group-hover:opacity-100 transition-opacity" />
                </button>
                <div className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-2xl shadow-red-900/60 border-2 border-white/10">
                   <Mic className="w-10 h-10 text-white animate-pulse" />
                </div>
             </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GuardianHUD;
