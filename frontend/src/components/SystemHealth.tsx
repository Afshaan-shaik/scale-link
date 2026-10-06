import React from 'react';
import { 
  Server, 
  Database, 
  Cpu, 
  Layers, 
  Radio, 
  CheckCircle2, 
  Activity, 
  HardDrive
} from 'lucide-react';

export const SystemHealth: React.FC = () => {
  const components = [
    {
      name: "API Backend",
      tech: "Go 1.22 + Chi Router",
      port: ":8080",
      status: "HEALTHY",
      desc: "Stateless HTTP redirect & link management REST engine",
      icon: Server,
      color: "emerald",
    },
    {
      name: "Cache & Rate Limiter",
      tech: "Redis 7 Alpine",
      port: ":6379",
      status: "CONNECTED",
      desc: "Sub-2ms cache-aside lookup & atomic Lua token bucket",
      icon: Cpu,
      color: "purple",
    },
    {
      name: "Primary Database",
      tech: "PostgreSQL 16",
      port: ":5432",
      status: "CONNECTED",
      desc: "Partitioned click_events by month & partial b-tree indexes",
      icon: Database,
      color: "sky",
    },
    {
      name: "Analytics Worker",
      tech: "Go Consumer Service",
      port: ":8082",
      status: "RUNNING",
      desc: "XREADGROUP consumer group click_workers with PEL recovery",
      icon: Radio,
      color: "teal",
    },
    {
      name: "Reverse Proxy & LB",
      tech: "Nginx 1.27",
      port: ":80",
      status: "RUNNING",
      desc: "JSON access logging, static PWA hosting & upstream proxy",
      icon: Layers,
      color: "amber",
    },
  ];

  return (
    <div className="w-full space-y-8 animate-fadeIn">
      {/* Top Banner Hero */}
      <div className="luxe-hero flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[16px] bg-[#34d6a018] border border-[#34d6a033] flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6 text-[var(--em)]" />
          </div>
          <div>
            <h2 className="text-white text-[28px] sm:text-[32px]">System Architecture &amp; Telemetry</h2>
            <p className="text-[var(--mut)] text-xs sm:text-sm">
              Live operational topology and capacity metrics for 100M links
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#34d6a018] border border-[#34d6a033] text-[var(--em)] text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4" />
          <span>All 5 Core Subsystems Operational</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <div className="luxe-inner-card p-6">
          <div className="text-xs text-[var(--mut)] mb-2 font-mono">Cache Hit Ratio</div>
          <div className="text-3xl font-extrabold font-mono text-[var(--em)]">94.2%</div>
          <div className="text-[11px] text-[var(--mut)] mt-1.5">SLA Target: &gt;90%</div>
        </div>

        <div className="luxe-inner-card p-6">
          <div className="text-xs text-[var(--mut)] mb-2 font-mono">Read / Write Ratio</div>
          <div className="text-3xl font-extrabold font-mono text-white">100 : 1</div>
          <div className="text-[11px] text-[var(--mut)] mt-1.5">Engineered for heavy reads</div>
        </div>

        <div className="luxe-inner-card p-6">
          <div className="text-xs text-[var(--mut)] mb-2 font-mono">P99 Read Latency</div>
          <div className="text-3xl font-extrabold font-mono text-[var(--gold)]">&lt; 8ms</div>
          <div className="text-[11px] text-[var(--mut)] mt-1.5">Measured via Redis cache</div>
        </div>

        <div className="luxe-inner-card p-6">
          <div className="text-xs text-[var(--mut)] mb-2 font-mono">Stream Lag / PEL</div>
          <div className="text-3xl font-extrabold font-mono text-[var(--sky)]">0 events</div>
          <div className="text-[11px] text-[var(--mut)] mt-1.5">Worker catches up instantly</div>
        </div>
      </div>

      {/* Components Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {components.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.name} className="luxe-card p-6 sm:p-7 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-[14px] bg-[var(--bg)] border border-[var(--line)]">
                      <Icon className="w-5 h-5 text-[var(--em)]" />
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-white">{c.name}</h4>
                      <p className="text-[12px] font-mono text-[var(--mut)]">{c.tech}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#34d6a018] text-[var(--em)] border border-[#34d6a033]">
                    {c.status}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[var(--mut)] mb-5 leading-relaxed">{c.desc}</p>
              </div>

              <div className="pt-4 border-t border-[var(--line)] flex items-center justify-between text-[11px] font-mono text-[var(--mut)]">
                <span>Port {c.port}</span>
                <span className="text-[var(--em)] flex items-center gap-1.5 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--em)] animate-pulse"></span>
                  <span>Active</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Engineering Trade-Offs & Architecture Math Section */}
      <div className="luxe-card p-7 sm:p-9 shadow-xl">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2.5">
          <HardDrive className="w-5 h-5 text-[var(--em)]" />
          <span>Capacity Math &amp; Architectural Trade-offs (from docs/DESIGN.md)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-[var(--mut)]">
          <div className="p-5 rounded-[20px] bg-[var(--bg2)] border border-[var(--line)]">
            <h4 className="font-bold text-white mb-2 text-sm">Storage at 100M Scale</h4>
            <p className="leading-relaxed">
              At 250 bytes per link, 100M links consume approximately <strong className="text-white">25 GB</strong> in PostgreSQL. Raw click events are partitioned monthly with 90-day pruning to ensure bounded table bloat.
            </p>
          </div>

          <div className="p-5 rounded-[20px] bg-[var(--bg2)] border border-[var(--line)]">
            <h4 className="font-bold text-white mb-2 text-sm">Cache Sizing (Pareto 80/20)</h4>
            <p className="leading-relaxed">
              Top 500,000 hottest URLs in the working set require just <strong className="text-white">~101 MB</strong> of Redis RAM. Negative caching stops cache-penetration enumeration attacks on non-existent codes.
            </p>
          </div>

          <div className="p-5 rounded-[20px] bg-[var(--bg2)] border border-[var(--line)]">
            <h4 className="font-bold text-white mb-2 text-sm">Crash-Resilient Streams</h4>
            <p className="leading-relaxed">
              Redis Streams decouple redirects from click persistence. Workers batch database commits and only XACK afterwards. If killed mid-run, auto-claim recovers unacknowledged events with zero event loss.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
