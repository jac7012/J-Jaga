
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
  Mic,
  AlertCircle
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
      if (transcript.includes("i crashed") || transcript.includes("help") || transcript.includes("jaga")) {
        setMode(AppMode.GUARDIAN);
      }
    };

    recognition.onerror = () => {
      setTimeout(() => { try { recognition.start(); } catch(e) {} }, 1000);
    };

    try { recognition.start(); } catch (e) {}
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
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`glass group p-6 rounded-[2rem] border-l-4 ${accent} flex items-center justify-between w-full text-left relative overflow-hidden`}
    >
      <div className="flex items-center gap-5 relative z-10">
        <div className="p-4 rounded-2xl bg-white/5 group-hover:bg-white/10 transition-colors">
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="mono text-[9px] uppercase opacity-40 mb-1 tracking-widest">Protocol Agent</span>
          <h3 className="text-xl font-black italic tracking-tighter uppercase leading-none">{title}</h3>
          <p className="text-[10px] text-white/50 mt-1 font-medium">{desc}</p>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 opacity-20" />
    </motion.button>
  );

  return (
    <div className="relative min-h-screen p-6 max-w-md mx-auto flex flex-col bg-[#020617] overflow-y-auto pb-32 no-scrollbar font-sans selection:bg-cyan-500/30">
      {/* HUD Header */}
      <div className="flex justify-between items-center py-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${voiceStandby ? 'bg-cyan-400 animate-pulse' : 'bg-red-500'}`} />
          <div className="text-[10px] mono font-bold text-cyan-400">J-JAGA_OS {voiceStandby ? 'LISTENING' : 'OFFLINE'}</div>
        </div>
        <div className="flex items-center gap-3 opacity-30 scale-75">
          <Signal className="w-4 h-4" />
          <Wifi className="w-4 h-4" />
          <Battery className="w-4 h-4" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* Fix: Moved GuardianHUD inside AnimatePresence to avoid early return and resolve type errors (overlap check) */}
        {mode === AppMode.GUARDIAN ? (
          <GuardianHUD key="guardian" onBack={() => setMode(AppMode.STANDBY)} />
        ) : mode === AppMode.STANDBY ? (
          <motion.div 
            key="home"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col"
          >
            <div className="flex flex-col items-center my-10">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                className="w-44 h-44 border border-cyan-500/10 rounded-full flex items-center justify-center relative shadow-[0_0_50px_rgba(34,211,238,0.05)]"
              >
                <div className="absolute inset-2 border border-cyan-500/5 rounded-full" />
                <CarFront className="w-20 h-20 neon-cyan opacity-80" />
              </motion.div>
              <h1 className="text-6xl font-black italic tracking-tighter uppercase mt-8 neon-cyan leading-none">J-JAGA</h1>
              <div className="flex items-center gap-3 mt-3">
                 <div className="h-px w-8 bg-cyan-500/30" />
                 <p className="mono text-[9px] opacity-40 tracking-[0.4em] uppercase">Autonomous Guardian</p>
                 <div className="h-px w-8 bg-cyan-500/30" />
              </div>
            </div>

            <div className="space-y-4">
               {/* SOS BUTTON - HIGH PRIORITY */}
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={() => setMode(AppMode.GUARDIAN)}
                className="w-full bg-red-600/95 p-8 rounded-[2.5rem] flex items-center justify-between shadow-[0_20px_40px_rgba(220,38,38,0.3)] border-b-4 border-red-800 active:border-b-0 active:translate-y-1 transition-all"
              >
                <div className="flex flex-col items-start">
                  <span className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">I CRASHED!</span>
                  <span className="text-[10px] mono text-white/60 uppercase tracking-widest mt-2">Emergency Live Response</span>
                </div>
                <div className="p-4 bg-white/10 rounded-2xl">
                  <ShieldAlert className="w-10 h-10 text-white animate-pulse" />
                </div>
              </motion.button>

              <div className="grid grid-cols-1 gap-4 pt-4">
                <ModeCard 
                  title="The Mechanic"
                  accent="border-cyan-500"
                  icon={<Wrench className="w-7 h-7 neon-cyan" />}
                  desc="Engine diagnostics & quote analysis."
                  onClick={() => setMode(AppMode.MECHANIC)}
                />
                <ModeCard 
                  title="The Sceptic"
                  accent="border-orange-500"
                  icon={<Search className="w-7 h-7 text-orange-400" />}
                  desc="Vetting used car listings for lemons."
                  onClick={() => setMode(AppMode.SCEPTIC)}
                />
              </div>
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
              className="flex items-center gap-2 mb-8 glass px-5 py-3 rounded-full border-white/5 text-[10px] mono uppercase font-bold text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> BACK_TO_DASHBOARD
            </button>
            {mode === AppMode.MECHANIC && <MechanicHUD onBack={() => setMode(AppMode.STANDBY)} />}
            {mode === AppMode.SCEPTIC && <ScepticHUD />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Dock */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm glass rounded-[2.5rem] p-2 border-white/5 flex justify-between items-center shadow-[0_30px_60px_-12px_rgba(0,0,0,0.6)] z-40">
        <button onClick={() => setMode(AppMode.MECHANIC)} className={`flex-1 py-4 rounded-3xl transition-all flex justify-center ${mode === AppMode.MECHANIC ? 'bg-cyan-500/20 text-cyan-400 shadow-inner' : 'text-white/20'}`}><Wrench className="w-6 h-6" /></button>
        <button onClick={() => setMode(AppMode.STANDBY)} className={`flex-1 py-4 rounded-3xl transition-all flex justify-center ${mode === AppMode.STANDBY ? 'bg-white/10 text-white' : 'text-white/20'}`}><CarFront className="w-6 h-6" /></button>
        <button onClick={() => setMode(AppMode.SCEPTIC)} className={`flex-1 py-4 rounded-3xl transition-all flex justify-center ${mode === AppMode.SCEPTIC ? 'bg-orange-500/20 text-orange-400 shadow-inner' : 'text-white/20'}`}><Search className="w-6 h-6" /></button>
        <button onClick={() => setMode(AppMode.GUARDIAN)} className={`flex-1 py-4 rounded-3xl transition-all flex justify-center ${mode === AppMode.GUARDIAN ? 'bg-red-500/20 text-red-500' : 'text-white/20'}`}><AlertCircle className="w-6 h-6" /></button>
      </div>
    </div>
  );
};

export default App;
