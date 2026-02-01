
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
  Lock,
  Volume2,
  Activity,
  UserCheck,
  Radio,
  Eye,
  Camera,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { createLiveSession } from '../../services/geminiService';

// --- PCM Decoding for Live Stream ---
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
  details?: string;
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
  const [micActivity, setMicActivity] = useState(0);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const audioOutContext = useRef<AudioContext | null>(null);
  const audioInContext = useRef<AudioContext | null>(null);
  const nextStartTime = useRef(0);
  const sessionPromise = useRef<Promise<any> | null>(null);

  const setupMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!audioInContext.current) return;

      const source = audioInContext.current.createMediaStreamSource(stream);
      const analyzer = audioInContext.current.createAnalyser();
      analyzer.fftSize = 128;
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);

      const updateMic = () => {
        analyzer.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setMicActivity(avg);
        requestAnimationFrame(updateMic);
      };
      updateMic();

      const processor = audioInContext.current.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) int16[i] = input[i] * 32768;
        sessionPromise.current?.then(s => s.sendRealtimeInput({
          media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' }
        }));
      };
      
      source.connect(analyzer);
      source.connect(processor);
      processor.connect(audioInContext.current.destination);
    } catch (err: any) {
      setErrorMsg("Mic access denied.");
    }
  };

  const handleStart = useCallback(async () => {
    if (isReady) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioOutContext.current = new AudioCtx({ sampleRate: 24000 });
      audioInContext.current = new AudioCtx({ sampleRate: 16000 });
      await audioOutContext.current.resume();
      await audioInContext.current.resume();

      await setupMicrophone();

      sessionPromise.current = createLiveSession({
        onopen: () => setErrorMsg(null),
        onmessage: async (msg: any) => {
          setIsAiThinking(false);

          // Audio playback and subtitle sync
          const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData && audioOutContext.current) {
            const buffer = await decodeAudioData(decode(audioData), audioOutContext.current, 24000);
            const source = audioOutContext.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioOutContext.current.destination);
            const start = Math.max(nextStartTime.current, audioOutContext.current.currentTime);
            source.start(start);
            nextStartTime.current = start + buffer.duration;
          }

          if (msg.serverContent?.inputTranscription) {
             setSubs(prev => ({ ...prev, user: msg.serverContent.inputTranscription.text }));
          }
          if (msg.serverContent?.outputTranscription) {
             setSubs(prev => ({ ...prev, ai: msg.serverContent.outputTranscription.text }));
          }

          // Tool Handling
          if (msg.toolCall) {
            for (const fc of msg.toolCall.functionCalls) {
              if (fc.name === 'draw_ar_marker') {
                setArMarker(fc.args);
                // Keep markers visible for a significant time for manual alignment
                setTimeout(() => setArMarker(null), 15000);
              }
              if (fc.name === 'log_evidence') {
                setEvidence(prev => [{
                  id: Math.random().toString(),
                  category: fc.args.category,
                  value: fc.args.value,
                  details: fc.args.details,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }, ...prev]);
                setIsVaultOpen(true);
              }
              sessionPromise.current?.then(s => s.sendToolResponse({
                functionResponses: [{ id: fc.id, name: fc.name, response: { status: "hud_synchronized" } }]
              }));
            }
          }
        },
        onerror: (err: any) => setErrorMsg("Guardian Link Interrupted. Retrying...")
      });

      sessionPromise.current.then(setSession);
      setIsReady(true);
    } catch (err) {
      setErrorMsg("Boot failed. Permissions missing.");
    }
  }, [isReady]);

  // Higher frequency vision stream for better damage recognition
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const frame = webcamRef.current?.getScreenshot();
      if (frame) {
        session.sendRealtimeInput({ media: { data: frame.split(',')[1], mimeType: 'image/jpeg' } });
      }
    }, 1000); 
    return () => clearInterval(interval);
  }, [session]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden text-white safe-area-inset" style={{ perspective: '1500px' }}>
      <Webcam 
        ref={webcamRef} 
        audio={false} 
        screenshotFormat="image/jpeg" 
        playsInline
        videoConstraints={{ facingMode: "environment", width: 720, height: 1280 }} 
        className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
      />

      {!isReady ? (
        <div className="absolute inset-0 z-50 glass-dark flex flex-col items-center justify-center p-10 text-center bg-black/95 backdrop-blur-3xl">
          <motion.div animate={{ scale: [1, 1.15, 1], filter: ["hue-rotate(0deg)", "hue-rotate(45deg)", "hue-rotate(0deg)"] }} transition={{ repeat: Infinity, duration: 3 }} className="mb-12">
            <ShieldAlert className="w-40 h-40 text-red-500 shadow-[0_0_100px_rgba(239,68,68,0.4)]" />
          </motion.div>
          <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-4 text-white">Deploy Guardian</h2>
          <p className="text-white/60 text-lg mb-12 max-w-xs mx-auto leading-tight font-medium">Establishing persistent investigation link.</p>
          
          <button 
            onClick={handleStart}
            className="px-16 py-8 bg-red-600 active:scale-90 transition-all rounded-[3.5rem] font-black text-2xl shadow-[0_40px_80px_rgba(220,38,38,0.5)] border-b-8 border-red-900 flex items-center gap-4"
          >
            START PROTOCOL
          </button>
        </div>
      ) : (
        <>
          {/* MOBILE-OPTIMIZED AR TARGETING (REFINED DEPTH) */}
          <AnimatePresence>
            {arMarker && (
              <motion.div 
                key="ar-marker"
                initial={{ opacity: 0, scale: 0.5, translateZ: -300 }} 
                animate={{ opacity: 1, scale: 1, translateZ: 0 }} 
                exit={{ opacity: 0, scale: 1.5, translateZ: 300 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <div 
                  className="relative w-80 h-64 border-2 border-cyan-400/10 rounded-3xl"
                  style={{ transform: `rotateX(${arMarker.rotationX || 0}deg) rotateY(${arMarker.rotationY || 0}deg)` }}
                >
                   {/* Heavy 3D Brackets */}
                   <div className="absolute top-0 left-0 w-20 h-20 border-t-8 border-l-8 border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.8)]" />
                   <div className="absolute top-0 right-0 w-20 h-20 border-t-8 border-r-8 border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.8)]" />
                   <div className="absolute bottom-0 left-0 w-20 h-20 border-b-8 border-l-8 border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.8)]" />
                   <div className="absolute bottom-0 right-0 w-20 h-20 border-b-8 border-r-8 border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.8)]" />
                   
                   <div className="absolute inset-0 bg-cyan-400/10 backdrop-blur-md rounded-3xl flex items-center justify-center border border-cyan-400/40">
                      <div className="flex flex-col items-center">
                         <Camera className="w-14 h-14 text-cyan-400 animate-pulse mb-4" />
                         <span className="text-[10px] mono text-cyan-400 font-black tracking-[0.5em] animate-pulse">ANALYZING TARGET</span>
                      </div>
                   </div>

                   <div className="absolute -top-16 left-0 right-0 flex justify-center">
                     <motion.div 
                        initial={{ y: 20 }} animate={{ y: 0 }}
                        className="bg-cyan-500 text-black px-8 py-3 rounded-full text-[12px] font-black uppercase tracking-widest shadow-[0_0_40px_rgba(34,211,238,0.6)] border-2 border-white"
                     >
                       ACTION: {arMarker.label}
                     </motion.div>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* HUD HEADER */}
          <div className="relative z-30 flex justify-between items-start p-6 pt-12 bg-gradient-to-b from-black/90 to-transparent">
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-600 animate-ping absolute" />
                <div className="w-3 h-3 rounded-full bg-red-500 relative" />
                <h1 className="text-2xl font-black italic text-red-500 tracking-tighter">GUARDIAN.PRO</h1>
              </div>
              <div className="flex items-center gap-3 mt-1 opacity-50">
                 <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                 <span className="text-[9px] mono uppercase tracking-widest font-black">Live Investigation Link</span>
              </div>
            </div>
            <button onClick={onBack} className="glass p-4 rounded-full border-white/10 active:scale-90 transition-all backdrop-blur-3xl shadow-xl">
              <ArrowLeft className="w-6 h-6" />
            </button>
          </div>

          {/* EVIDENCE VAULT */}
          <motion.div 
            initial={false}
            animate={{ x: isVaultOpen ? 0 : 'calc(100% - 35px)' }}
            className="absolute top-48 right-0 bottom-80 w-72 glass rounded-l-[3rem] border-l-2 border-white/10 z-40 shadow-2xl transition-all overflow-hidden"
          >
            <button 
              onClick={(e) => { e.stopPropagation(); setIsVaultOpen(!isVaultOpen); }}
              className="absolute left-0 top-1/2 -translate-y-1/2 p-4 bg-red-600 text-white rounded-r-2xl shadow-xl hover:bg-red-500"
            >
              <ChevronRight className={`w-5 h-5 transition-transform ${isVaultOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className="p-8 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                <ClipboardList className="w-5 h-5 text-cyan-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white italic">Evidence Log</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 no-scrollbar">
                {evidence.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-10 text-center italic p-4">
                    <Activity className="w-12 h-12 mb-4 text-cyan-400" />
                    <span className="text-[9px] mono uppercase tracking-widest">Awaiting Proof...</span>
                  </div>
                ) : (
                  evidence.map(item => (
                    <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} key={item.id} className="bg-white/5 border-l-4 border-cyan-500 p-4 rounded-r-2xl shadow-xl backdrop-blur-md">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[8px] mono text-cyan-400 font-black tracking-widest">{item.category}</span>
                        <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                      </div>
                      <p className="text-sm font-black uppercase leading-tight tracking-tight text-white">{item.value}</p>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </motion.div>

          {/* THINKING & DYNAMIC TRANSCRIPTIONS */}
          <div className="mt-auto p-6 mb-36 z-30 space-y-4">
            <AnimatePresence mode="popLayout">
              {isAiThinking && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2 mb-2">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span className="text-[9px] mono text-cyan-400 uppercase tracking-widest">Agent Processing...</span>
                </motion.div>
              )}
              {subs.user && (
                <motion.div key="user" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-end">
                  <div className="glass bg-black/50 border border-white/10 px-5 py-3 rounded-2xl rounded-tr-none text-right max-w-[85%] shadow-xl backdrop-blur-2xl">
                    <div className="flex items-center gap-2 justify-end mb-1 opacity-30">
                       <span className="text-[8px] mono uppercase font-black tracking-widest">Environmental Scan</span>
                       <Volume2 className="w-2.5 h-2.5" />
                    </div>
                    <p className="text-sm font-bold text-white leading-tight italic tracking-tight">"{subs.user}"</p>
                  </div>
                </motion.div>
              )}
              {subs.ai && (
                <motion.div key="ai" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full glass border-2 border-red-500/40 flex items-center justify-center shrink-0 shadow-xl overflow-hidden relative bg-red-950/20">
                     <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-1 bg-red-500 rounded-full" />
                  </div>
                  <div className="glass bg-red-950/20 border border-red-500/30 px-6 py-4 rounded-3xl rounded-tl-none max-w-[85%] shadow-[0_0_80px_rgba(239,68,68,0.2)] backdrop-blur-3xl">
                    <span className="text-[8px] mono text-red-400 font-black block mb-1 uppercase tracking-widest">Guardian Voice</span>
                    <p className="text-xl font-black leading-[0.9] text-white italic tracking-tighter drop-shadow-lg">
                      {subs.ai}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* EMERGENCY STATUS FOOTER */}
          <div className="absolute bottom-0 inset-x-0 glass border-t border-white/10 bg-black/95 z-40 p-6 pb-12 flex items-center justify-between shadow-[0_-30px_60px_rgba(0,0,0,0.9)]">
             <div className="flex flex-col">
                <div className="flex items-center gap-2">
                   <AlertTriangle className="w-6 h-6 text-yellow-500 animate-pulse" />
                   <span className="text-lg font-black uppercase text-yellow-500 tracking-tighter italic">PROTOCOL_LIVE</span>
                </div>
                {/* Visual Audio Meter */}
                <div className="flex items-center gap-1 mt-3">
                   {[...Array(12)].map((_, i) => (
                     <motion.div 
                       key={i} 
                       animate={{ 
                         height: Math.max(4, (micActivity * (0.8 + Math.random() * 0.4)) / 4),
                         backgroundColor: micActivity > 35 ? '#ef4444' : '#22d3ee'
                       }}
                       className="w-1 rounded-full transition-all duration-75" 
                     />
                   ))}
                   <span className="text-[8px] mono text-white/20 ml-2 uppercase font-black">Intake Active</span>
                </div>
             </div>
             <div className="flex gap-4">
                <button className="w-16 h-16 rounded-2xl glass border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors shadow-xl">
                   <History className="w-8 h-8 opacity-20" />
                </button>
                <div className="relative">
                   <div className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-[0_0_50px_rgba(220,38,38,0.8)] border-4 border-white/20 relative z-10">
                      <Mic className="w-10 h-10 text-white animate-pulse" />
                   </div>
                </div>
             </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GuardianHUD;
