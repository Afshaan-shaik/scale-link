import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  RotateCcw, 
  AlertTriangle, 
  ShieldAlert
} from 'lucide-react';

export const TokenBucketMeter: React.FC = () => {
  const CAPACITY = 200;

  const [tokens, setTokens] = useState<number>(184);
  const [rejections, setRejections] = useState<number>(0);
  const [lastStatus, setLastStatus] = useState<number>(200);

  // Automatic token refill simulation matching the Redis Lua script logic
  useEffect(() => {
    const timer = setInterval(() => {
      setTokens((prev) => {
        if (prev >= CAPACITY) return CAPACITY;
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
    <div className="w-full space-y-8 animate-fadeIn">
      {/* Title Hero */}
      <div className="luxe-hero p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[16px] bg-[#f0b44c18] border border-[#f0b44c33] flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6 text-[var(--gold)]" />
          </div>
          <div>
            <h2 className="text-white text-[28px] sm:text-[32px]">Token Bucket Rate Limiter</h2>
            <p className="text-[var(--mut)] text-xs sm:text-sm">
              Atomic Redis Lua script enforcement per IP &amp; API Key with millisecond precision
            </p>
          </div>
        </div>
      </div>

      {/* Meter Display Card */}
      <div className="luxe-card p-6 sm:p-9 shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Left: Gauge */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase font-bold tracking-wider text-[var(--mut)] font-mono">Available Tokens</span>
              <span className="font-mono text-base font-bold text-[var(--em)]">
                {tokens} / {CAPACITY}
              </span>
            </div>

            {/* Visual Bucket Progress Bar */}
            <div className="h-7 w-full bg-[var(--bg)] rounded-full border border-[var(--line)] p-1 overflow-hidden relative shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  pct > 40
                    ? 'bg-gradient-to-r from-[var(--em)] to-[#14946b]'
                    : pct > 15
                    ? 'bg-gradient-to-r from-[var(--gold)] to-[var(--amber)]'
                    : 'bg-gradient-to-r from-rose-500 to-red-600 animate-pulse'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3 mt-5 text-center">
              <div className="p-3 rounded-[16px] bg-[var(--bg2)] border border-[var(--line)]">
                <div className="text-[11px] text-[var(--mut)] uppercase font-mono">Fill Pct</div>
                <div className="text-lg font-bold font-mono text-white mt-0.5">{pct}%</div>
              </div>
              <div className="p-3 rounded-[16px] bg-[var(--bg2)] border border-[var(--line)]">
                <div className="text-[11px] text-[var(--mut)] uppercase font-mono">Refill Rate</div>
                <div className="text-lg font-bold font-mono text-[var(--em)] mt-0.5">200 / min</div>
              </div>
              <div className="p-3 rounded-[16px] bg-[var(--bg2)] border border-[var(--line)]">
                <div className="text-[11px] text-[var(--mut)] uppercase font-mono">429 Blocked</div>
                <div className="text-lg font-bold font-mono text-rose-400 mt-0.5">{rejections}</div>
              </div>
            </div>
          </div>

          {/* Right: Interactive controls */}
          <div className="space-y-3.5">
            <p className="text-xs font-semibold text-[var(--tx)] font-mono">Simulate Inbound Request Bursts:</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => spendTokens(1)}
                className="luxe-btn justify-center py-3 text-xs font-semibold"
              >
                <Zap className="w-3.5 h-3.5 text-[var(--em)]" />
                <span>Spend 1 Token</span>
              </button>

              <button
                onClick={() => spendTokens(10)}
                className="luxe-btn justify-center py-3 text-xs font-semibold text-[var(--gold)] border-[#e3c38344]"
              >
                <Zap className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span>Burst 10 Tokens</span>
              </button>

              <button
                onClick={() => spendTokens(50)}
                className="luxe-btn justify-center py-3 text-xs font-semibold text-[var(--amber)] border-[#f0b44c44]"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--amber)]" />
                <span>Burst 50 Tokens</span>
              </button>

              <button
                onClick={() => setTokens(CAPACITY)}
                className="luxe-btn justify-center py-3 text-xs font-semibold text-[var(--sky)] border-[#6cc8f044]"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[var(--sky)]" />
                <span>Refill Bucket</span>
              </button>
            </div>

            {/* Exhaust trigger button */}
            <button
              onClick={() => spendTokens(tokens + 1)}
              className="w-full py-3 rounded-[16px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all flex items-center justify-center space-x-2 active:scale-95"
            >
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Drain All Tokens (Trigger HTTP 429)</span>
            </button>
          </div>
        </div>

        {/* Live Headers Inspection */}
        <div className="mt-8 pt-6 border-t border-[var(--line)]">
          <div className="flex items-center justify-between text-xs font-mono mb-3">
            <span className="text-[var(--mut)]">Response Headers Emitted:</span>
            <span className={`px-2.5 py-1 rounded-[8px] font-bold ${
              lastStatus === 200 ? 'bg-[#34d6a022] text-[var(--em)] border border-[#34d6a044]' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              HTTP {lastStatus === 200 ? '200 OK (Allowed)' : '429 Too Many Requests'}
            </span>
          </div>

          <div className="p-4 rounded-[18px] bg-[var(--bg)] border border-[var(--line)] font-mono text-xs text-[var(--tx)] space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[var(--mut)]">X-RateLimit-Limit:</span>
              <span className="text-[var(--em)] font-semibold">{CAPACITY}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--mut)]">X-RateLimit-Remaining:</span>
              <span className={tokens > 0 ? 'text-[var(--em)] font-semibold' : 'text-rose-400 font-semibold'}>{tokens}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--mut)]">X-RateLimit-Reset:</span>
              <span className="text-[var(--mut)]">{Math.ceil((CAPACITY - tokens) / (CAPACITY / 60))}s</span>
            </div>
            {tokens === 0 && (
              <div className="flex justify-between text-rose-400 font-bold pt-1.5 border-t border-[var(--line)]">
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
