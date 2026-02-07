
import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert,
  ArrowLeft,
  Mic,
  Lock,
  Activity,
  UserCheck,
  Eye,
  CheckCircle2,
  Target,
  Zap,
  Loader2,
  Keyboard,
  SendHorizontal,
  MessageSquareQuote,
  Megaphone,
  Scale,
  Camera,
  HeartPulse,
  Info,
  AlertTriangle,
  Scan,
  Database
} from 'lucide-react';
import { createLiveSession } from '../../services/geminiService';

// --- PCM Decoding/Encoding for Live Stream ---
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

function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

interface EvidenceItem {
  id: string;
  category: 'PLATE' | 'WITNESS_STMT' | 'DAMAGE_REPORT' | 'OTHER_PARTY_ADMISSION' | 'VERBAL_TIMELINE' | 'MEDICAL_STATUS';
  value: string;
  time: string;
  details?: string;
  imageUrl?: string;
}

interface HologramPanel {
  title: string;
  data_points: string[];
  severity: 'INFO' | 'CAUTION' | 'CRITICAL';
}

const DEMO_EVIDENCE: EvidenceItem[] = [
  {
    id: 'demo-0',
    category: 'MEDICAL_STATUS',
    value: 'USER_STABLE: NO EXTERNAL BLEEDING REPORTED.',
    time: '14:20:05',
    details: 'Initial triage check. User reports slight neck stiffness but mobile.'
  },
  {
    id: 'demo-1',
    category: 'DAMAGE_REPORT',
    value: 'IMPACT_ZONE: FRONT LEFT (60% CRUMPLE)',
    time: '14:22:10',
    details: 'Heavy indentation on Perodua Myvi bumper. Radiator exposed.',
    imageUrl: 'https://images.unsplash.com/photo-1597328290883-50c5787b7c7e?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'demo-2',
    category: 'PLATE',
    value: 'WXA 1234 (TOYOTA HILUX)',
    time: '14:23:45',
    details: 'Identified via Computer Vision. PDRM Database Query: Road Tax Valid.',
    imageUrl: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'demo-3',
    category: 'OTHER_PARTY_ADMISSION',
    value: 'DRIVER_B: "SAYA TAK PERASAN BANG, SORI SANGAT."',
    time: '14:25:02',
    details: 'Verbal admission of distraction captured by Guardian. Audio preserved.',
  },
  {
    id: 'demo-4',
    category: 'VERBAL_TIMELINE',
    value: 'JAGA: "JANGAN MINTA MAAF. PAN CAMERA KE ROAD TAX DIA." | USER: "OKAY KEJAP."',
    time: '14:26:15',
    details: 'Incident management logs. Active guidance phase.',
  },
  {
    id: 'demo-5',
    category: 'WITNESS_STMT',
    value: 'SAKSI (RIDER): "MEMANG HILUX TU TERUS JE TADI."',
    time: '14:28:30',
    details: 'Third party verification of negligence.',
  }
];

const GuardianHUD: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const webcamRef = useRef<Webcam>(null);
  const [arMarker, setArMarker] = useState<any>(null);
  const [hologram, setHologram] = useState<HologramPanel | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>(DEMO_EVIDENCE);
  const [subs, setSubs] = useState({ user: "", ai: "" });
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [micActivity, setMicActivity] = useState(0);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [debugMode, setDebugMode] = useState(true); // Start with debug enabled
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const [aiStatus, setAiStatus] = useState<string>('IDLE');

  const addDebugLog = (msg: string) => {
    console.log(msg);
    setDebugLog(prev => [msg, ...prev.slice(0, 20)]);
  };

  const testAI = () => {
    addDebugLog('🧪 Testing AI with sample text...');
    const testMsg = "Hello, I need help documenting this accident";
    if (sessionPromise.current) {
      sessionPromise.current.then(s => s.sendRealtimeInput({ text: testMsg }));
    }
  };

  const audioOutContext = useRef<AudioContext | null>(null);
  const audioInContext = useRef<AudioContext | null>(null);
  const nextStartTime = useRef(0);
  const sources = useRef(new Set<AudioBufferSourceNode>());
  const sessionPromise = useRef<Promise<any> | null>(null);
  const recognitionRef = useRef<any>(null);
  const isRecognitionRunning = useRef(false);

  const startStreaming = useCallback(async () => {
    try {
      addDebugLog('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      addDebugLog('✅ Microphone access granted');

      // Start speech recognition
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true; // Enable interim results for real-time
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          isRecognitionRunning.current = true;
          // addDebugLog('🎤 Speech recognition active'); // REMOVED SPAM
        };

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }

          // Show interim results in real-time
          if (interimTranscript) {
            setSubs(prev => ({ ...prev, user: interimTranscript }));
          }

          // Send final transcript to AI
          if (finalTranscript) {
            const cleanTranscript = finalTranscript.trim();
            addDebugLog('✅ You said: ' + cleanTranscript);
            setSubs(prev => ({ ...prev, user: cleanTranscript }));

            // Send to AI
            if (sessionPromise.current) {
              addDebugLog('📤 Sending to AI...');
              sessionPromise.current.then(s => s.sendRealtimeInput({ text: cleanTranscript }));
            }
          }
        };

        recognition.onerror = (event: any) => {
          isRecognitionRunning.current = false;
          if (event.error === 'not-allowed') {
            addDebugLog('❌ Microphone permission denied!');
            alert('⚠️ Microphone permission denied! Please allow microphone access in your browser settings.');
          } else if (event.error !== 'aborted') {
            // addDebugLog('❌ Speech error: ' + event.error);
          }
        };

        recognition.onend = () => {
          isRecognitionRunning.current = false;
          // Only auto-restart if the component is still mounted
          setTimeout(() => {
            if (recognitionRef.current && !isRecognitionRunning.current) {
              try {
                recognition.start();
              } catch (e) {
                // Silently fail - will retry on next onend
              }
            }
          }, 1000);
        };

        recognitionRef.current = recognition;
        try {
          recognition.start();
          addDebugLog('🎤 Speech recognition initialized');
        } catch (e) {
          addDebugLog('❌ Could not start: ' + e);
        }
      } else {
        addDebugLog('⚠️ Speech recognition not supported');
        alert('⚠️ Speech recognition not supported. Use Chrome, Edge, or Safari.');
      }

      // Audio visualizer
      if (!audioInContext.current) return;
      const source = audioInContext.current.createMediaStreamSource(stream);
      const scriptProcessor = audioInContext.current.createScriptProcessor(4096, 1, 1);

      scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setMicActivity(Math.min(100, Math.sqrt(sum / inputData.length) * 400));
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioInContext.current.destination);
    } catch (err) {
      console.error("❌ Mic stream error:", err);
      alert("Microphone access denied. Please allow microphone access to use voice features.");
    }
  }, []);

  const handleSendText = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!textInput.trim() || !sessionPromise.current) return;
    console.log('📤 Sending text:', textInput);
    sessionPromise.current.then(s => s.sendRealtimeInput({ text: textInput }));
    setSubs(prev => ({ ...prev, user: textInput }));
    setTextInput("");
    setIsTyping(false);
  };

  const initSession = useCallback(() => {
    addDebugLog('🚀 Initializing Guardian session...');
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    audioOutContext.current = new AudioCtx({ sampleRate: 24000 });
    audioInContext.current = new AudioCtx({ sampleRate: 16000 });

    const session = createLiveSession({
      onopen: () => {
        addDebugLog('✅ Session connected - Ready!');
        setIsReady(true);
        setIsConnecting(false);
        startStreaming();
      },
      onstatus: (status: string) => {
        setAiStatus(status);
        if (status.includes('RETRY')) addDebugLog('⚠️ AI Retrying...');
      },
      onmessage: async (message: any) => {
        if (message.toolCall) {
          addDebugLog('🔧 Tool call received');
          for (const fc of message.toolCall.functionCalls) {
            if (fc.name === 'draw_ar_marker') {
              addDebugLog(`📍 AR Marker: ${fc.args.target}`);
              setArMarker(fc.args);
              sessionPromise.current?.then(s => s.sendToolResponse({
                functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Marker deployed." } }]
              }));
            } else if (fc.name === 'holographic_overlay') {
              addDebugLog(`📊 Hologram: ${fc.args.title}`);
              setHologram(fc.args);
              sessionPromise.current?.then(s => s.sendToolResponse({
                functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Hologram active." } }]
              }));
            } else if (fc.name === 'log_evidence') {
              addDebugLog(`🗂️ Evidence logged: ${fc.args.category}`);
              const newItem: EvidenceItem = {
                id: Math.random().toString(36).substr(2, 9),
                category: fc.args.category,
                value: fc.args.value,
                time: new Date().toLocaleTimeString(),
                details: fc.args.details
              };
              setEvidence(prev => [newItem, ...prev]);
              sessionPromise.current?.then(s => s.sendToolResponse({
                functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Evidence logged." } }]
              }));
            }
          }
        }

        const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audioData && audioOutContext.current) {
          const ctx = audioOutContext.current;
          nextStartTime.current = Math.max(nextStartTime.current, ctx.currentTime);
          const buffer = await decodeAudioData(decode(audioData), ctx, 24000);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(nextStartTime.current);
          nextStartTime.current += buffer.duration;
          sources.current.add(source);
        }

        if (message.serverContent?.inputTranscription) {
          setSubs(prev => ({ ...prev, user: message.serverContent.inputTranscription.text }));
        }
        if (message.serverContent?.outputTranscription) {
          addDebugLog('🤖 AI: ' + message.serverContent.outputTranscription.text.substring(0, 50));
          setSubs(prev => ({ ...prev, ai: prev.ai + message.serverContent.outputTranscription.text }));
        }
        if (message.serverContent?.turnComplete) {
          setTimeout(() => { setSubs({ user: "", ai: "" }); setArMarker(null); }, 8000);
        }

        if (message.serverContent?.interrupted) {
          sources.current.forEach(s => { try { s.stop(); } catch (e) { } });
          sources.current.clear();
          nextStartTime.current = 0;
        }
      },
      onerror: (err: any) => {
        addDebugLog('❌ Session error: ' + err?.message);
        setIsConnecting(false);
      },
      onclose: () => {
        addDebugLog('🔌 Session closed');
        setIsReady(false);
      }
    });
    sessionPromise.current = session;
  }, [startStreaming]);

  useEffect(() => {
    if (!isReady) return;
    addDebugLog('📸 Camera streaming to AI');
    const interval = setInterval(() => {
      const frame = webcamRef.current?.getScreenshot();
      if (frame && sessionPromise.current) {
        // Silently send frames (don't spam debug log)
        sessionPromise.current.then(s => s.sendRealtimeInput({
          media: { data: frame.split(',')[1], mimeType: 'image/jpeg' }
        }));
      }
    }, 10000); // Every 10 seconds (reduced frequency for quota)
    return () => clearInterval(interval);
  }, [isReady]);

  useEffect(() => {
    initSession();
    return () => {
      console.log('🧹 Cleaning up Guardian session...');
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) { }
      }
      sources.current.forEach(s => { try { s.stop(); } catch (e) { } });
      if (audioInContext.current) audioInContext.current.close();
      if (audioOutContext.current) audioOutContext.current.close();
    };
  }, [initSession]);

  const getEvidenceIcon = (category: string) => {
    switch (category) {
      case 'WITNESS_STMT': return <Megaphone className="w-6 h-6 text-orange-400" />;
      case 'OTHER_PARTY_ADMISSION': return <Scale className="w-6 h-6 text-red-400" />;
      case 'VERBAL_TIMELINE': return <MessageSquareQuote className="w-6 h-6 text-cyan-400" />;
      case 'MEDICAL_STATUS': return <HeartPulse className="w-6 h-6 text-rose-500" />;
      case 'PLATE': return <Camera className="w-6 h-6 text-white" />;
      default: return <Eye className="w-6 h-6 text-cyan-400" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden font-mono uppercase italic">
      {/* Background Camera */}
      <div className="absolute inset-0">
        <Webcam
          ref={webcamRef} audio={false} screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 border-[1px] border-white/5 pointer-events-none" />
      </div>

      {/* ADVANCED AR TARGETING */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
        <AnimatePresence>
          {arMarker && (
            <motion.div initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.2, opacity: 0 }} className="relative">
              <div className="w-64 h-64 relative">
                {/* Tactical Brackets */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-400" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-400" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-400" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-400" />

                {/* Target Scope */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Scan className="w-16 h-16 text-cyan-400/50 animate-spin" />
                  <Target className="absolute w-8 h-8 text-cyan-400 animate-pulse" />
                </div>

                {/* Floating ID Label */}
                <motion.div animate={{ x: [0, 10, 0] }} className="absolute -top-12 left-0 right-0 text-center">
                  <span className="bg-cyan-500 text-black px-4 py-1 text-[10px] font-black tracking-widest shadow-[0_0_15px_cyan]">
                    ID_{arMarker.target.toUpperCase()}_LOCKED
                  </span>
                </motion.div>
                <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-max glass border-cyan-500/50 px-6 py-2">
                  <span className="text-cyan-400 text-xs font-black tracking-tighter">{arMarker.label}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* HOLOGRAPHIC DATA PANEL (TOP RIGHT) */}
      <div className="absolute top-20 right-4 z-40 w-56 pointer-events-none">
        <AnimatePresence>
          {hologram && (
            <motion.div initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }} className="glass border-cyan-500/30 p-4 rounded-2xl backdrop-blur-3xl shadow-[0_0_30px_rgba(34,211,238,0.1)]">
              <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
                {hologram.severity === 'CRITICAL' ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <Database className="w-4 h-4 text-cyan-400" />}
                <span className={`text-[10px] font-black ${hologram.severity === 'CRITICAL' ? 'text-red-500' : 'text-cyan-400'}`}>{hologram.title}</span>
              </div>
              <ul className="space-y-1.5">
                {hologram.data_points.map((p, i) => (
                  <li key={i} className="text-[9px] text-white/80 font-bold flex items-start gap-2">
                    <div className="w-1 h-1 bg-cyan-400 rounded-full mt-1 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* HUD Header */}
      <div className="relative z-30 p-4 bg-gradient-to-b from-black/90 to-transparent flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-red-500 animate-pulse" />
              <span className="text-xl font-black text-white italic tracking-tighter uppercase">Guardian_v3.0</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Activity className={`w-3 h-3 ${isReady ? 'text-green-400 animate-pulse' : 'text-yellow-400'}`} />
              <span className={`text-[8px] font-black tracking-widest uppercase ${isReady ? 'text-green-400' : 'text-yellow-400'}`}>
                {isConnecting ? 'CONNECTING...' : isReady ? '🔴 LIVE • RECORDING' : 'INITIALIZING'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Mic className={`w-3 h-3 ${micActivity > 10 ? 'text-cyan-400 animate-pulse' : 'text-white/30'}`} />
              <span className="text-[8px] text-white/50 font-black tracking-widest uppercase">
                MIC: {micActivity > 10 ? 'ACTIVE' : 'LISTENING'}
              </span>
            </div>
            {/* NEW AI STATUS INDICATOR */}
            <div className="flex items-center gap-2 mt-1">
              <Loader2 className={`w-3 h-3 ${aiStatus === 'PROCESSING' || aiStatus.includes('RETRY') ? 'text-yellow-400 animate-spin' : 'text-white/30'}`} />
              <span className={`text-[8px] font-black tracking-widest uppercase ${aiStatus.includes('RETRY') ? 'text-red-400' : aiStatus === 'PROCESSING' ? 'text-yellow-400' : 'text-white/50'}`}>
                AI: {aiStatus}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setDebugMode(!debugMode)}
                className="mt-2 text-[7px] text-white/30 hover:text-white/60 font-black tracking-widest uppercase"
              >
                {debugMode ? '🔍 HIDE DEBUG' : '🔍 SHOW DEBUG'}
              </button>
              <button
                onClick={testAI}
                className="mt-2 text-[7px] text-cyan-400/50 hover:text-cyan-400 font-black tracking-widest uppercase border border-cyan-500/30 px-2 py-1 rounded"
              >
                🧪 TEST AI
              </button>
            </div>
          </div>
          <button onClick={onBack} className="p-3 glass rounded-full border-white/10 active:bg-white/20">
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Debug Panel */}
        {debugMode && (
          <div className="glass border-cyan-500/30 p-3 rounded-xl max-h-40 overflow-y-auto">
            <div className="text-[8px] font-mono space-y-1">
              {debugLog.length === 0 && <div className="text-white/30">Waiting for activity...</div>}
              {debugLog.map((log, i) => (
                <div key={i} className="text-cyan-400/80">{log}</div>
              ))}
            </div>
          </div>
        )}

        {/* Subtitles Area */}
        <div className="max-w-[300px] space-y-2 pointer-events-none">
          {/* Speech Recognition Indicator */}
          {micActivity > 10 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass border-cyan-500/50 p-3 rounded-xl backdrop-blur-md bg-cyan-500/10"
            >
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span className="text-[10px] text-cyan-400 font-black tracking-widest uppercase">
                  🎤 LISTENING...
                </span>
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="popLayout">
            {subs.ai && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                <div className="shrink-0 w-8 h-8 rounded bg-red-700 flex items-center justify-center border border-red-500 shadow-[0_0_10px_red]">
                  <UserCheck className="w-4 h-4 text-white" />
                </div>
                <div className="glass bg-black/90 border border-red-600/30 p-4 rounded-tr-2xl rounded-b-2xl backdrop-blur-md">
                  <p className="text-[12px] font-black text-white leading-tight uppercase tracking-tight">{subs.ai}</p>
                </div>
              </motion.div>
            )}
            {subs.user && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2 opacity-50">
                <div className="shrink-0 w-8 h-8 rounded bg-cyan-900 flex items-center justify-center border border-cyan-500">
                  <Mic className="w-4 h-4 text-white" />
                </div>
                <div className="glass bg-black/60 border border-cyan-500/20 p-2 rounded-tr-xl rounded-b-xl">
                  <p className="text-[10px] text-cyan-200 font-bold italic">"{subs.user}"</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Interaction Deck */}
      <div className="mt-auto relative z-30 p-4 pb-8 flex flex-col gap-4">
        {/* Permanent Text Input */}
        <div className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-2 flex items-center gap-2">
          <form onSubmit={handleSendText} className="flex-1 flex gap-2">
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="TYPE MESSAGE TO GUARDIAN..."
              className="flex-1 bg-transparent px-4 py-2 text-white font-black italic text-xs outline-none tracking-tight uppercase placeholder:text-white/30"
            />
            <button type="submit" className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center text-black shadow-[0_0_15px_cyan]">
              <SendHorizontal className="w-5 h-5" />
            </button>
          </form>
        </div>

        <div className="flex gap-4 h-16">
          <button onClick={() => setIsVaultOpen(!isVaultOpen)} className="flex-1 glass border-white/10 rounded-[1.2rem] p-3 flex flex-col items-center justify-center gap-1 active:bg-white/10 transition-all">
            <Lock className={`w-5 h-5 ${evidence.length > 0 ? 'text-green-500 drop-shadow-[0_0_10px_green]' : 'text-white/40'}`} />
            <span className="text-[8px] font-black tracking-widest text-white/50 uppercase">Vault: {evidence.length}</span>
          </button>

          <div className="flex-1 glass border-white/10 rounded-[1.2rem] p-3 flex flex-col items-center justify-center gap-2">
            <div className="flex items-center gap-3 w-full px-2">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Mic className="w-4 h-4" />
              </div>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div animate={{ width: `${micActivity}%` }} className="h-full bg-cyan-400 shadow-[0_0_15px_cyan]" />
              </div>
            </div>
            <span className="text-[8px] font-black tracking-widest text-white/40 uppercase">Acoustic Guard</span>
          </div>
        </div>
      </div>

      {/* VAULT OVERLAY */}
      <AnimatePresence>
        {isVaultOpen && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="absolute inset-0 z-[100] bg-slate-950/98 backdrop-blur-3xl p-8 flex flex-col">
            <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-6">
              <div className="flex flex-col">
                <h2 className="text-4xl font-black italic text-cyan-400 tracking-tighter uppercase">Incident_Secure_Storage</h2>
                <span className="text-[10px] opacity-40 font-bold tracking-[0.5em] mt-2 uppercase">Tamper-Proof Verbal & Visual Evidence</span>
              </div>
              <button onClick={() => setIsVaultOpen(false)} className="p-5 glass border-white/10 rounded-full hover:bg-white/10 active:scale-90">
                <Zap className="w-8 h-8 text-white" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 no-scrollbar pb-20">
              {evidence.map((item) => (
                <div key={item.id} className={`glass border-white/10 p-6 rounded-[1.5rem] flex flex-col gap-4 relative overflow-hidden group ${item.category === 'OTHER_PARTY_ADMISSION' ? 'border-red-500/50 bg-red-500/5' : ''}`}>
                  <div className={`absolute top-0 left-0 w-1 h-full ${item.category === 'OTHER_PARTY_ADMISSION' ? 'bg-red-500' : 'bg-cyan-500'}`} />

                  <div className="flex items-start gap-5">
                    <div className={`p-3 rounded-xl ${item.category === 'OTHER_PARTY_ADMISSION' ? 'bg-red-500/10' : 'bg-cyan-500/10'}`}>
                      {getEvidenceIcon(item.category)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-[10px] font-black tracking-widest ${item.category === 'OTHER_PARTY_ADMISSION' ? 'text-red-400' : 'text-cyan-400'}`}>{item.category}</span>
                        <span className="text-[9px] opacity-30 font-bold uppercase">{item.time}</span>
                      </div>
                      <p className="text-xl font-black text-white leading-tight italic tracking-tighter uppercase">{item.value}</p>
                    </div>
                    <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0 shadow-[0_0_10px_green]" />
                  </div>

                  {item.imageUrl && (
                    <div className="relative w-full h-48 rounded-2xl overflow-hidden border border-white/10">
                      <img src={item.imageUrl} alt="Evidence" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                      <div className="absolute bottom-3 left-4 flex items-center gap-2">
                        <Camera className="w-4 h-4 text-cyan-400" />
                        <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Optical_Acquisition_ID_452</span>
                      </div>
                    </div>
                  )}

                  {item.details && (
                    <div className="bg-black/60 rounded-xl p-4 border border-white/5 group-hover:border-cyan-500/20 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-3 h-3 text-white/30" />
                        <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">Contextual Intelligence</span>
                      </div>
                      <p className="text-[11px] text-white/70 italic font-bold leading-relaxed">{item.details}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GuardianHUD;
