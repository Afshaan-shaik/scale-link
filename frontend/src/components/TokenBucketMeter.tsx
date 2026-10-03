import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  RotateCcw, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Layers,
  Code2
} from 'lucide-react';

export const TokenBucketMeter: React.FC = () => {
  const CAPACITY = 200;
  const REFILL_RATE = 200; // 200 tokens per 60 seconds = ~3.33 tokens/sec

  const [tokens, setTokens] = useState<number>(184);
  const [lastRefill, setLastRefill] = useState<number>(Date.now());
  const [rejections, setRejections] = useState<number>(0);
  const [lastStatus, setLastStatus] = useState<number>(200);

  // Automatic token refill simulation matching the Redis Lua script logic
  useEffect(() => {
    const timer = setInterval(() => {
      setTokens((prev) => {
        if (prev >= CAPACITY) return CAPACITY;
        const now = Date.now();
        // Add 1 token every 300ms (~3.33/sec = 200/min)
        return Math.min(CAPACITY, prev + 1);
      });
    }, 300);

    return () => clearInterval(timer);
  }, []);

  const spendTokens = (amount: number) => {
    if (tokens >= amount) {
      setTokens((prev) => prev - amount);
      setLastStatus(200);
    } else {
      setTokens(0);
      setRejections((prev) => prev + 1);
      setLastStatus(429);
    }
  };

  const pct = Math.round((tokens / CAPACITY) * 100);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Token Bucket Rate Limiter</h2>
            <p className="text-xs text-slate-400">Atomic Redis Lua script enforcement per IP & API Key with millisecond precision</p>
          </div>
        </div>
      </div>

      {/* Meter Display Card */}
      <div className="glass-card p-6 sm:p-8 rounded-2xl border border-slate-800 relative overflow-hidden shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Left: Gauge */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Available Tokens</span>
              <span className="font-mono text-sm font-bold text-emerald-400">
                {tokens} / {CAPACITY}
              </span>
            </div>

            {/* Visual Bucket Progress Bar */}
            <div className="h-6 w-full bg-slate-900 rounded-full border border-slate-700/80 p-1 overflow-hidden relative shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  pct > 40
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : pct > 15
                    ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                    : 'bg-gradient-to-r from-rose-500 to-red-600 animate-pulse'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-mono">Fill Pct</div>
                <div className="text-base font-bold font-mono text-white">{pct}%</div>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-mono">Refill Rate</div>
                <div className="text-base font-bold font-mono text-emerald-400">200 / min</div>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-mono">429 Blocked</div>
                <div className="text-base font-bold font-mono text-rose-400">{rejections}</div>
              </div>
            </div>
          </div>

          {/* Right: Interactive controls */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-300">Simulate Inbound Request Bursts:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => spendTokens(1)}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center space-x-1.5 active:scale-95"
              >
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Spend 1 Token</span>
              </button>

              <button
                onClick={() => spendTokens(10)}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center space-x-1.5 active:scale-95"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Burst 10 Tokens</span>
              </button>

              <button
                onClick={() => spendTokens(50)}
                className="px-3 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30 transition-all flex items-center justify-center space-x-1.5 active:scale-95"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Burst 50 Tokens</span>
              </button>

              <button
                onClick={() => setTokens(CAPACITY)}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center space-x-1.5 active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                <span>Refill Bucket</span>
              </button>
            </div>

            {/* Exhaust trigger button */}
            <button
              onClick={() => spendTokens(tokens + 1)}
              className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all flex items-center justify-center space-x-1.5 active:scale-95"
            >
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Drain All Tokens (Trigger HTTP 429)</span>
            </button>
          </div>
        </div>

        {/* Live Headers Inspection */}
        <div className="mt-6 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="text-slate-400">Response Headers Emitted:</span>
            <span className={`px-2 py-0.5 rounded font-bold ${
              lastStatus === 200 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              HTTP {lastStatus === 200 ? '200 OK (Allowed)' : '429 Too Many Requests'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs text-slate-300 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">X-RateLimit-Limit:</span>
              <span className="text-emerald-400">{CAPACITY}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">X-RateLimit-Remaining:</span>
              <span className={tokens > 0 ? 'text-emerald-400' : 'text-rose-400'}>{tokens}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">X-RateLimit-Reset:</span>
              <span className="text-slate-400">{Math.ceil((CAPACITY - tokens) / (CAPACITY / 60))}s</span>
            </div>
            {tokens === 0 && (
              <div className="flex justify-between text-rose-400 font-bold pt-1 border-t border-slate-800">
                <span>Retry-After:</span>
                <span>2s</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
