
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
  Radio
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

  const audioOutContext = useRef<AudioContext | null>(null);
  const audioInContext = useRef<AudioContext | null>(null);
  const nextStartTime = useRef(0);
  const sessionPromise = useRef<Promise<any> | null>(null);

  // Setup streaming microphone with analyzer
  const setupMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!audioInContext.current) return;

      const source = audioInContext.current.createMediaStreamSource(stream);
      const analyzer = audioInContext.current.createAnalyser();
      analyzer.fftSize = 256;
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
      setErrorMsg("Microphone access denied. Check your settings.");
    }
  };

  const handleStart = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
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
          // 1. Audio Playback Alignment
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

          // 2. Real-time Subtitles Alignment
          if (msg.serverContent?.inputTranscription) {
             // If AI identifies "Ambient" in text, we could label it differently
             setSubs(prev => ({ ...prev, user: msg.serverContent.inputTranscription.text }));
          }
          if (msg.serverContent?.outputTranscription) {
             setSubs(prev => ({ ...prev, ai: msg.serverContent.outputTranscription.text }));
          }

          // 3. Clear Subtitles on turn completion for fresh conversation
          if (msg.serverContent?.turnComplete) {
             // We keep them briefly for readability
             setTimeout(() => setSubs(prev => ({ ...prev, user: "" })), 3000);
          }

          // 4. Agentic Tool Responses
          if (msg.toolCall) {
            for (const fc of msg.toolCall.functionCalls) {
              if (fc.name === 'draw_ar_marker') {
                setArMarker(fc.args);
                setTimeout(() => setArMarker(null), 12000);
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
                functionResponses: [{ id: fc.id, name: fc.name, response: { status: "logged_success" } }]
              }));
            }
          }
        },
        onerror: (err: any) => {
          console.error("Live Error", err);
          setErrorMsg("Guardian link reset. Reconnecting...");
        }
      });

      sessionPromise.current.then(setSession);
      setIsReady(true);
    } catch (err) {
      setErrorMsg("Initialization failed. Check hardware.");
    }
  }, [isReady]);

  // Video loop for investigation phase
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const frame = webcamRef.current?.getScreenshot();
      if (frame) session.sendRealtimeInput({ media: { data: frame.split(',')[1], mimeType: 'image/jpeg' } });
    }, 1000); // 1 FPS for power management
    return () => clearInterval(interval);
  }, [session]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden text-white safe-area-inset" style={{ perspective: '2000px' }}>
      <Webcam 
        ref={webcamRef} 
        audio={false} 
        screenshotFormat="image/jpeg" 
        videoConstraints={{ facingMode: "environment", width: 1280, height: 720 }} 
        className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
      />

      {/* EMERGENCY ACTIVATION OVERLAY */}
      {!isReady && (
        <div className="absolute inset-0 z-50 glass flex flex-col items-center justify-center p-8 text-center bg-black/90 backdrop-blur-3xl">
          <motion.div animate={{ scale: [1, 1.1, 1], filter: ["blur(0px)", "blur(2px)", "blur(0px)"] }} transition={{ repeat: Infinity, duration: 2 }} className="mb-12">
            <ShieldAlert className="w-32 h-32 text-red-500 shadow-[0_0_50px_rgba(239,68,68,0.5)]" />
          </motion.div>
          <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-4 text-white">Activate Guardian</h2>
          <p className="text-white/60 text-lg mb-12 max-w-xs mx-auto">Tap to establish a real-time voice link with J-Jaga Guardian Agent.</p>
          
          {errorMsg && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8 flex items-center gap-3 text-red-400 bg-red-500/10 px-6 py-3 rounded-2xl border border-red-500/30">
              <Lock className="w-5 h-5" />
              <span className="text-sm font-bold uppercase mono">{errorMsg}</span>
            </motion.div>
          )}

          <button 
            onClick={handleStart}
            className="px-16 py-8 bg-red-600 hover:bg-red-500 active:scale-90 transition-all rounded-[3rem] font-black text-2xl shadow-[0_40px_80px_rgba(220,38,38,0.6)] border-b-[10px] border-red-900"
          >
            START PROTOCOL
          </button>
        </div>
      )}

      {/* LIVE HUD */}
      {isReady && (
        <>
          {/* HOLOGRAPHIC AR TARGETING */}
          <AnimatePresence>
            {arMarker && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.2, translateZ: -1000 }} 
                animate={{ opacity: 1, scale: 1, translateZ: 0 }} 
                exit={{ opacity: 0, scale: 2, translateZ: 500 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <div 
                  className="relative w-80 h-56 border-2 border-cyan-400/20 rounded-[3rem]"
                  style={{ transform: `rotateX(${arMarker.rotationX || 0}deg) rotateY(${arMarker.rotationY || 0}deg)` }}
                >
                   {/* 3D Brackets */}
                   <div className="absolute top-0 left-0 w-16 h-16 border-t-8 border-l-8 border-cyan-400 shadow-[0_0_30px_#22d3ee]" />
                   <div className="absolute top-0 right-0 w-16 h-16 border-t-8 border-r-8 border-cyan-400 shadow-[0_0_30px_#22d3ee]" />
                   <div className="absolute bottom-0 left-0 w-16 h-16 border-b-8 border-l-8 border-cyan-400 shadow-[0_0_30px_#22d3ee]" />
                   <div className="absolute bottom-0 right-0 w-16 h-16 border-b-8 border-r-8 border-cyan-400 shadow-[0_0_30px_#22d3ee]" />
                   
                   <div className="absolute inset-0 bg-cyan-400/5 backdrop-blur-sm rounded-[3rem] flex items-center justify-center">
                      <div className="flex flex-col items-center">
                         <Radio className="w-12 h-12 text-cyan-400 animate-ping mb-4" />
                         <span className="text-[12px] mono text-cyan-400 font-black tracking-[0.4em] animate-pulse">LOCKING TARGET...</span>
                      </div>
                   </div>

                   <div className="absolute -top-16 inset-x-0 flex justify-center">
                     <div className="bg-cyan-500 text-black px-10 py-3 rounded-full text-sm font-black uppercase tracking-widest shadow-2xl border-4 border-black/80">
                       ACTION: {arMarker.label}
                     </div>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* TOP HUD BAR */}
          <div className="relative z-30 flex justify-between items-start p-8 pt-14 bg-gradient-to-b from-black/90 to-transparent">
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-red-600 animate-ping absolute" />
                <div className="w-4 h-4 rounded-full bg-red-500 relative" />
                <h1 className="text-3xl font-black italic text-red-500 tracking-tighter">GUARDIAN.LIVE</h1>
              </div>
              <div className="flex items-center gap-3 mt-2">
                 <div className="px-2 py-0.5 bg-red-500/20 rounded border border-red-500/30 text-[9px] font-black uppercase tracking-widest text-red-400">Recording</div>
                 <span className="text-[10px] mono text-white/40 uppercase tracking-[0.2em]">Blackbox Protocol Active</span>
              </div>
            </div>
            <button onClick={onBack} className="glass p-5 rounded-full border-white/20 active:scale-90 transition-all backdrop-blur-3xl shadow-2xl">
              <ArrowLeft className="w-8 h-8" />
            </button>
          </div>

          {/* EVIDENCE VAULT (SIDEBAR) */}
          <motion.div 
            initial={false}
            animate={{ x: isVaultOpen ? 0 : 'calc(100% - 40px)' }}
            className="absolute top-48 right-0 bottom-80 w-80 glass rounded-l-[4rem] border-l-2 border-white/10 z-40 shadow-2xl"
          >
            <button 
              onClick={(e) => { e.stopPropagation(); setIsVaultOpen(!isVaultOpen); }}
              className="absolute left-0 top-1/2 -translate-y-1/2 p-5 bg-red-600 text-white rounded-r-3xl shadow-2xl hover:bg-red-500"
            >
              <ChevronRight className={`w-6 h-6 transition-transform ${isVaultOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className="p-10 flex flex-col h-full overflow-hidden">
              <div className="flex items-center gap-4 mb-10 border-b border-white/10 pb-6">
                <ClipboardList className="w-7 h-7 text-cyan-400" />
                <span className="text-lg font-black uppercase tracking-tighter text-white italic">Evidence Vault</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-6 no-scrollbar">
                {evidence.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-10 text-center italic">
                    <Activity className="w-20 h-20 mb-8" />
                    <span className="text-xs font-black uppercase tracking-widest">Listening for Evidence...</span>
                  </div>
                ) : (
                  evidence.map(item => (
                    <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} key={item.id} className="bg-white/5 border-l-8 border-cyan-500 p-6 rounded-r-[2rem] shadow-2xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] mono text-cyan-400 font-black">{item.category}</span>
                        <span className="text-[10px] mono text-white/20">{item.time}</span>
                      </div>
                      <p className="text-xl font-black uppercase leading-none tracking-tighter text-white mb-2">{item.value}</p>
                      {item.details && <p className="text-[10px] text-white/40 italic leading-tight">{item.details}</p>}
                    </motion.div>
                  ))
                )}
              </div>
              <div className="mt-8 pt-6 border-t border-white/10 flex items-center gap-4 opacity-30">
                <UserCheck className="w-5 h-5" />
                <span className="text-[10px] mono uppercase font-black">Agent Certified Log</span>
              </div>
            </div>
          </motion.div>

          {/* DYNAMIC REAL-TIME SUBTITLES */}
          <div className="mt-auto p-8 mb-40 z-30 space-y-6">
            <AnimatePresence mode="popLayout">
              {subs.user && (
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-end">
                  <div className="glass-light bg-black/60 border-2 border-white/10 px-8 py-5 rounded-[2.5rem] rounded-tr-none text-right max-w-[92%] shadow-2xl backdrop-blur-3xl">
                    <div className="flex items-center gap-3 justify-end mb-2">
                       <span className="text-[10px] mono text-white/30 uppercase tracking-[0.3em] font-black">
                         {subs.user.length > 50 ? 'AMBIENT/ENVIRONMENT' : 'USER_VOICE'}
                       </span>
                       <Activity className="w-3 h-3 text-white/30" />
                    </div>
                    <p className="text-xl font-bold text-white leading-tight italic tracking-tight">"{subs.user}"</p>
                  </div>
                </motion.div>
              )}
              {subs.ai && (
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-5">
                  <div className="w-16 h-16 rounded-full glass border-4 border-red-500/50 flex items-center justify-center shrink-0 shadow-2xl overflow-hidden relative">
                     <div className="absolute inset-0 bg-red-600/10 animate-pulse" />
                     {[...Array(5)].map((_, i) => (
                        <motion.div 
                          key={i} 
                          animate={{ height: [10, 30, 10], scale: [1, 1.2, 1] }} 
                          transition={{ repeat: Infinity, duration: 0.5 + i * 0.1 }}
                          className="w-1.5 mx-0.5 bg-red-500 rounded-full" 
                        />
                     ))}
                  </div>
                  <div className="glass bg-red-950/40 border-2 border-red-500/40 px-10 py-8 rounded-[3.5rem] rounded-tl-none max-w-[85%] shadow-[0_0_120px_rgba(239,68,68,0.3)] backdrop-blur-3xl">
                    <span className="text-[10px] mono text-red-400 font-black block mb-3 uppercase tracking-[0.4em]">Guardian Command</span>
                    <p className="text-3xl font-black leading-[0.9] text-white italic tracking-tighter drop-shadow-2xl">
                      {subs.ai}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* EMERGENCY STATUS FOOTER */}
          <div className="absolute bottom-0 inset-x-0 glass border-t-2 border-white/10 bg-black/95 z-40 p-8 pb-16 flex items-center justify-between shadow-[0_-40px_100px_rgba(0,0,0,0.9)]">
             <div className="flex flex-col">
                <div className="flex items-center gap-4">
                   <AlertTriangle className="w-8 h-8 text-yellow-500 animate-pulse" />
                   <span className="text-2xl font-black uppercase text-yellow-500 tracking-tighter italic">PROTOCOL_ACTIVE</span>
                </div>
                {/* Real-time Mic Activity Meter */}
                <div className="flex items-center gap-1.5 mt-5">
                   {[...Array(16)].map((_, i) => (
                     <motion.div 
                       key={i} 
                       animate={{ 
                         height: Math.max(6, (micActivity * (0.8 + Math.random() * 0.4)) / 2),
                         backgroundColor: micActivity > 40 ? '#ef4444' : '#22d3ee'
                       }}
                       className="w-1.5 rounded-full transition-colors" 
                     />
                   ))}
                   <span className="text-[10px] mono text-white/30 ml-4 uppercase font-black tracking-widest">Ambient Intake Open</span>
                </div>
             </div>
             <div className="flex gap-6">
                <button className="w-24 h-24 rounded-[2rem] glass border-2 border-white/10 flex items-center justify-center active:bg-white/20 transition-all shadow-2xl group overflow-hidden">
                   <History className="w-12 h-12 opacity-30 group-hover:opacity-100 transition-opacity" />
                </button>
                <div className="relative">
                   <motion.div 
                     animate={{ scale: [1, 1.4, 1], opacity: [0.1, 0.3, 0.1] }}
                     transition={{ repeat: Infinity, duration: 1.5 }}
                     className="absolute -inset-10 bg-red-600 rounded-full blur-[60px]"
                   />
                   <div className="w-28 h-28 rounded-full bg-red-600 flex items-center justify-center shadow-[0_0_80px_rgba(220,38,38,0.8)] border-8 border-white/20 relative z-10">
                      <Mic className="w-14 h-14 text-white animate-pulse" />
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
