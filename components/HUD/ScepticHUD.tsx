
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, AlertTriangle, Gauge, History } from 'lucide-react';
import { analyzeSceptic } from '../../services/geminiService';
import { ScepticResult } from '../../types';

const ScepticHUD: React.FC = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScepticResult | null>(null);

  const runAnalysis = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await analyzeSceptic(url);
      setResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex flex-col">
        <h2 className="text-2xl font-black italic mono uppercase tracking-tighter text-orange-400">The Sceptic</h2>
        <p className="text-xs text-white/50 mono">USED CAR VETTING ENGINE</p>
      </div>

      <div className="glass rounded-2xl p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3 border border-white/10 focus-within:border-orange-500 transition-colors">
          <Search className="w-5 h-5 opacity-40" />
          <input 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste marketplace or video link..."
            className="bg-transparent border-none outline-none text-sm flex-1 text-white"
          />
        </div>
        <button 
          onClick={runAnalysis}
          disabled={loading || !url}
          className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all uppercase mono text-sm"
        >
          {loading ? 'Analyzing Video...' : 'VET LISTING'}
        </button>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="glass rounded-3xl p-6 border-white/5 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <div className="flex flex-col">
                <span className="mono text-[10px] opacity-50 uppercase">Lemon Score</span>
                <span className={`text-4xl font-black ${result.lemonScore > 70 ? 'text-red-500' : 'text-green-500'}`}>
                  {result.lemonScore}
                </span>
              </div>
              <Gauge className={`w-12 h-12 ${result.lemonScore > 70 ? 'text-red-500' : 'text-green-500'}`} />
            </div>
            
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden mb-4">
              <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: `${result.lemonScore}%` }} 
                className={`h-full ${result.lemonScore > 70 ? 'bg-red-500' : 'bg-green-500'}`} 
              />
            </div>
            <p className="text-sm text-white/70 italic leading-relaxed">"{result.summary}"</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 px-2">
              <History className="w-4 h-4 text-orange-400" />
              <span className="text-[10px] mono uppercase tracking-widest opacity-50">Heatmap Timeline</span>
            </div>
            {result.flags.map((flag, i) => (
              <div key={i} className="glass p-4 rounded-xl border-l-4 border-red-500/50 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white/90">{flag.issue}</span>
                  <span className="text-[10px] mono opacity-40">FLAGGED AT {flag.timestamp}</span>
                </div>
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ScepticHUD;
