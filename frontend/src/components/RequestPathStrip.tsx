import React, { useState } from 'react';
import { 
  ArrowRight, 
  Database, 
  Cpu, 
  Globe, 
  Layers, 
  Zap, 
  Radio, 
  CheckCircle2, 
  Clock, 
  Activity,
  AlertTriangle
} from 'lucide-react';

interface RequestPathStripProps {
  lastEvent?: {
    code: string;
    cache: 'HIT' | 'MISS' | 'NONE';
    servedBy: 'redis' | 'db';
    latencyMs: number;
    timestamp: string;
  };
}

export const RequestPathStrip: React.FC<RequestPathStripProps> = ({ lastEvent }) => {
  const [activeStep, setActiveStep] = useState<number>(3); // 3 = Cache
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedPath, setSimulatedPath] = useState<{
    cache: 'HIT' | 'MISS';
    latency: number;
    servedBy: 'redis' | 'db';
    code: string;
  }>({
    cache: lastEvent?.cache === 'MISS' ? 'MISS' : 'HIT',
    latency: lastEvent?.latencyMs || 1.8,
    servedBy: lastEvent?.servedBy || 'redis',
    code: lastEvent?.code || 'gh-repo',
  });

  const triggerSimulation = (type: 'HIT' | 'MISS') => {
    setIsSimulating(true);
    setActiveStep(0);

    const steps = [0, 1, 2, 3, type === 'MISS' ? 4 : 5, 5, 6];
    let currentIdx = 0;

    const interval = setInterval(() => {
      currentIdx++;
      if (currentIdx < steps.length) {
        setActiveStep(steps[currentIdx]);
      } else {
        clearInterval(interval);
        setIsSimulating(false);
        setSimulatedPath({
          cache: type,
          latency: type === 'HIT' ? +(Math.random() * 1.5 + 1.2).toFixed(1) : +(Math.random() * 12 + 15).toFixed(1),
          servedBy: type === 'HIT' ? 'redis' : 'db',
          code: type === 'HIT' ? 'gh-repo' : 'new-link-' + Math.floor(Math.random() * 900 + 100),
        });
      }
    }, 180);
  };

  return (
    <div className="glass-card rounded-2xl p-5 mb-8 border border-slate-800 shadow-xl relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
            <h3 className="font-bold text-slate-100 text-base tracking-tight">
              Real-Time Request Pipeline & Cache-Aside Strip
            </h3>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Live Flow
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Observing incoming GET /{simulatedPath.code} redirects traversing Nginx, Redis Token Bucket, Cache-Aside, and Streams
          </p>
        </div>

        {/* Quick Simulator Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => triggerSimulation('HIT')}
            disabled={isSimulating}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 transition-all flex items-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Simulate Cache HIT (Warm)</span>
          </button>
          <button
            onClick={() => triggerSimulation('MISS')}
            disabled={isSimulating}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 transition-all flex items-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Database className="w-3.5 h-3.5 text-amber-400" />
            <span>Simulate Cache MISS (Cold)</span>
          </button>
        </div>
      </div>

      {/* Pipeline Visual Nodes */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 sm:gap-3 my-4">
        {/* Step 1: Client */}
        <div className={`p-3 rounded-xl border transition-all ${
          activeStep === 0 
            ? 'bg-emerald-500/20 border-emerald-400 shadow-md shadow-emerald-500/10' 
            : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <Globe className="w-4 h-4 text-sky-400" />
            <span className="text-[10px] font-mono text-slate-400">Step 1</span>
          </div>
          <p className="text-xs font-semibold text-white">Client Device</p>
          <p className="text-[11px] text-slate-400 truncate">HTTP GET /{simulatedPath.code}</p>
        </div>

        {/* Step 2: Nginx */}
        <div className={`p-3 rounded-xl border transition-all ${
          activeStep === 1 
            ? 'bg-emerald-500/20 border-emerald-400 shadow-md shadow-emerald-500/10' 
            : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-mono text-slate-400">Step 2</span>
          </div>
          <p className="text-xs font-semibold text-white">Nginx Proxy</p>
          <p className="text-[11px] text-slate-400 truncate">:8080 Load Balancer</p>
        </div>

        {/* Step 3: Token Bucket Rate Limiter */}
        <div className={`p-3 rounded-xl border transition-all ${
          activeStep === 2 
            ? 'bg-emerald-500/20 border-emerald-400 shadow-md shadow-emerald-500/10' 
            : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-mono text-slate-400">Step 3</span>
          </div>
          <p className="text-xs font-semibold text-white">Token Bucket</p>
          <p className="text-[11px] text-emerald-400 truncate">Allowed (Lua Script)</p>
        </div>

        {/* Step 4: Redis Cache */}
        <div className={`p-3 rounded-xl border transition-all ${
          activeStep === 3 
            ? simulatedPath.cache === 'HIT' 
              ? 'bg-emerald-500/20 border-emerald-400 ring-2 ring-emerald-500/30' 
              : 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-500/30'
            : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <Cpu className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] font-mono text-slate-400">Step 4</span>
          </div>
          <div className="flex items-center space-x-1">
            <p className="text-xs font-semibold text-white">Redis Cache</p>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
              simulatedPath.cache === 'HIT' ? 'bg-emerald-500/30 text-emerald-300' : 'bg-amber-500/30 text-amber-300'
            }`}>
              {simulatedPath.cache}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">
            {simulatedPath.cache === 'HIT' ? 'Served in ~1.8ms' : 'Miss -> Query DB'}
          </p>
        </div>

        {/* Step 5: PostgreSQL (Miss Path) */}
        <div className={`p-3 rounded-xl border transition-all ${
          activeStep === 4 
            ? 'bg-amber-500/20 border-amber-400' 
            : 'bg-slate-900/60 border-slate-800 opacity-80'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <Database className="w-4 h-4 text-sky-400" />
            <span className="text-[10px] font-mono text-slate-400">Step 5</span>
          </div>
          <p className="text-xs font-semibold text-white">PostgreSQL 16</p>
          <p className="text-[11px] text-slate-400 truncate">
            {simulatedPath.cache === 'MISS' ? 'Read & Populate Cache' : 'Bypassed (Hot Cache)'}
          </p>
        </div>

        {/* Step 6: Async Redis Stream & Worker */}
        <div className={`p-3 rounded-xl border transition-all ${
          activeStep >= 5 
            ? 'bg-teal-500/20 border-teal-400 shadow-md shadow-teal-500/10' 
            : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <Radio className="w-4 h-4 text-teal-400" />
            <span className="text-[10px] font-mono text-slate-400">Step 6</span>
          </div>
          <p className="text-xs font-semibold text-white">Redis Streams</p>
          <p className="text-[11px] text-teal-400 truncate">clicks:events (Async)</p>
        </div>
      </div>

      {/* Live Response Headers Strip */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center space-x-3">
          <span className="text-slate-400">HTTP Response:</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
            302 Found
          </span>
          <span className="text-slate-300">
            X-Cache: <strong className={simulatedPath.cache === 'HIT' ? 'text-emerald-400' : 'text-amber-400'}>{simulatedPath.cache}</strong>
          </span>
          <span className="text-slate-300">
            X-Served-By: <strong className="text-sky-400">{simulatedPath.servedBy}</strong>
          </span>
          <span className="text-slate-300 flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{simulatedPath.latency}ms</span>
          </span>
        </div>

        <div className="flex items-center space-x-2 text-[11px] text-slate-400">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Non-blocking async click event published to worker group</span>
        </div>
      </div>
    </div>
  );
};
