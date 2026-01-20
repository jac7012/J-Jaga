
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldAlert, 
  Wrench, 
  Search, 
  ChevronRight, 
  Battery, 
  Wifi, 
  Signal, 
  CarFront,
  ArrowLeft,
  Mic
} from 'lucide-react';
import { AppMode } from './types';
import GuardianHUD from './components/HUD/GuardianHUD';
import MechanicHUD from './components/HUD/MechanicHUD';
import ScepticHUD from './components/HUD/ScepticHUD';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.STANDBY);
  const [voiceStandby, setVoiceStandby] = useState(false);

  // Global Voice Trigger Logic
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setVoiceStandby(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      console.log("Heard:", transcript);
      if (transcript.includes("i crashed") || transcript.includes("help") || transcript.includes("jaga")) {
        setMode(AppMode.GUARDIAN);
      }
    };

    recognition.onerror = () => {
      setTimeout(() => recognition.start(), 1000);
    };

    try {
      recognition.start();
    } catch (e) {}

    return () => recognition.stop();
  }, []);

  const ModeCard: React.FC<{ 
    title: string; 
    icon: React.ReactNode; 
    desc: string; 
    onClick: () => void;
    accent: string;
  }> = ({ title, icon, desc, onClick, accent }) => (
    <motion.button
      whileHover={{ scale: 1.02, x: 5 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`glass group p-6 rounded-[2rem] border-l-4 ${accent} flex items-center justify-between w-full text-left relative overflow-hidden`}
    >
      <div className="flex items-center gap-6 relative z-10">
        <div className="p-4 rounded-2xl bg-white/5 group-hover:bg-white/10 transition-colors">
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="mono text-[10px] uppercase opacity-40 mb-1 tracking-widest">Intent Mode</span>
          <h3 className="text-xl font-black italic tracking-tighter uppercase leading-none">{title}</h3>
          <p className="text-xs text-white/50 mt-1">{desc}</p>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 opacity-20 group-hover:opacity-100 transition-opacity relative z-10" />
    </motion.button>
  );

  if (mode === AppMode.GUARDIAN) {
    return <GuardianHUD onBack={() => setMode(AppMode.STANDBY)} />;
  }

  return (
    <div className="relative min-h-screen p-6 max-w-md mx-auto flex flex-col bg-[#020617] overflow-y-auto pb-32 no-scrollbar">
      {/* HUD Headers */}
      <div className="flex justify-between items-center py-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${voiceStandby ? 'bg-cyan-400 animate-pulse' : 'bg-red-500'}`} />
          <div className="text-xs mono font-bold text-cyan-400">J-JAGA {voiceStandby ? 'LISTENING' : 'OFFLINE'}</div>
        </div>
        <div className="flex items-center gap-3 opacity-40">
          <Signal className="w-4 h-4" />
          <Wifi className="w-4 h-4" />
          <Battery className="w-4 h-4" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {mode === AppMode.STANDBY ? (
          <motion.div 
            key="home"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 flex flex-col gap-6"
          >
            <div className="flex flex-col items-center my-8">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                className="w-40 h-40 border border-cyan-500/20 rounded-full flex items-center justify-center relative"
              >
                <div className="absolute inset-2 border border-cyan-500/10 rounded-full animate-pulse" />
                <CarFront className="w-16 h-16 neon-cyan" />
              </motion.div>
              <h1 className="text-5xl font-black italic tracking-tighter uppercase mt-6 neon-cyan leading-none">J-JAGA</h1>
              <p className="mono text-[10px] opacity-30 tracking-[0.5em] mt-2 uppercase">Your Car's Angel</p>
              {voiceStandby && (
                <div className="mt-4 flex items-center gap-2 glass px-3 py-1 rounded-full border-cyan-500/20">
                  <Mic className="w-3 h-3 text-cyan-400 animate-bounce" />
                  <span className="text-[8px] mono text-cyan-400 uppercase tracking-widest">Say "I Crashed" to Trigger</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <ModeCard 
                title="The Mechanic"
                accent="border-cyan-500"
                icon={<Wrench className="w-7 h-7 neon-cyan" />}
                desc="Acoustic diagnostics & fraud detection."
                onClick={() => setMode(AppMode.MECHANIC)}
              />
              <ModeCard 
                title="The Sceptic"
                accent="border-orange-500"
                icon={<Search className="w-7 h-7 text-orange-400" />}
                desc="Used car vetting & listing analysis."
                onClick={() => setMode(AppMode.SCEPTIC)}
              />
              
              <button 
                onClick={() => setMode(AppMode.GUARDIAN)}
                className="mt-6 p-10 rounded-[2.5rem] bg-red-600/90 hover:bg-red-500 transition-all shadow-[0_25px_50px_rgba(220,38,38,0.4)] flex flex-col items-center gap-3 active:scale-95 group relative"
              >
                <div className="absolute inset-0 bg-red-400/10 animate-ping rounded-[2.5rem] pointer-events-none" />
                <ShieldAlert className="w-14 h-14 text-white group-hover:scale-110 transition-transform relative z-10" />
                <div className="flex flex-col items-center relative z-10">
                  <span className="text-3xl font-black text-white italic tracking-tighter">I CRASHED!</span>
                  <span className="mono text-white/50 text-[10px] uppercase tracking-widest">Voice Activated Guardian</span>
                </div>
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="active-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1"
          >
            <button 
              onClick={() => setMode(AppMode.STANDBY)}
              className="flex items-center gap-2 mb-8 glass px-4 py-2 rounded-full border-white/5 text-[10px] mono uppercase opacity-60 hover:opacity-100 transition-all"
            >
              <ArrowLeft className="w-4 h-4" /> RETURN_TO_HOME
            </button>
            {mode === AppMode.MECHANIC && <MechanicHUD onBack={() => setMode(AppMode.STANDBY)} />}
            {mode === AppMode.SCEPTIC && <ScepticHUD />}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm glass rounded-[2rem] p-2 border-white/5 flex justify-between items-center shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] z-40">
        <button onClick={() => setMode(AppMode.MECHANIC)} className={`flex-1 p-4 rounded-2xl transition-all flex justify-center ${mode === AppMode.MECHANIC ? 'bg-cyan-500/20 text-cyan-400' : 'text-white/20'}`}><Wrench className="w-6 h-6" /></button>
        <button onClick={() => setMode(AppMode.STANDBY)} className={`flex-1 p-4 rounded-2xl transition-all flex justify-center ${mode === AppMode.STANDBY ? 'bg-white/10 text-white' : 'text-white/20'}`}><CarFront className="w-6 h-6" /></button>
        <button onClick={() => setMode(AppMode.SCEPTIC)} className={`flex-1 p-4 rounded-2xl transition-all flex justify-center ${mode === AppMode.SCEPTIC ? 'bg-orange-500/20 text-orange-400' : 'text-white/20'}`}><Search className="w-6 h-6" /></button>
      </div>
    </div>
  );
};

export default App;
