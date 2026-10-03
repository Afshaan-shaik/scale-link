import React, { useState } from 'react';
import { 
  BarChart3, 
  Globe2, 
  Smartphone, 
  Monitor, 
  Tablet, 
  Bot, 
  ExternalLink, 
  Calendar, 
  TrendingUp,
  Share2,
  Filter
} from 'lucide-react';
import { Link, LinkStats } from '../api';

interface AnalyticsDashboardProps {
  links: Link[];
  selectedCode: string;
  onSelectCode: (code: string) => void;
  stats: LinkStats | null;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  links,
  selectedCode,
  onSelectCode,
  stats,
}) => {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  const currentLink = links.find((l) => l.code === selectedCode) || links[0];
  const activeStats = stats;

  const totalClicks = activeStats?.total || currentLink?.click_count || 0;

  // Find max count for SVG scaling
  const maxDayCount = Math.max(...(activeStats?.per_day?.map((d) => d.count) || [1]), 10);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Selector Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Click Analytics</h2>
            <p className="text-xs text-slate-400">Asynchronously consumed via Redis Streams & partitioned by month</p>
          </div>
        </div>

        {/* Link Dropdown & Date Range Selector */}
        <div className="flex items-center space-x-3">
          <select
            value={selectedCode}
            onChange={(e) => onSelectCode(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-emerald-400 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {links.map((link) => (
              <option key={link.code} value={link.code}>
                /{link.code} ({link.click_count} clicks)
              </option>
            ))}
          </select>

          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-medium">
            {(['7d', '30d', '90d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  dateRange === r ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Clicks */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Total Redirects</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white">
            {totalClicks.toLocaleString()}
          </div>
          <p className="text-[11px] text-emerald-400 mt-1 flex items-center space-x-1">
            <span>Async Worker Processed</span>
          </p>
        </div>

        {/* Card 2: Top Country */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Primary Country</span>
            <Globe2 className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {activeStats?.countries?.[0]?.country || 'US'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {activeStats?.countries?.[0]?.count ? `${activeStats.countries[0].count} clicks (${Math.round((activeStats.countries[0].count / (totalClicks || 1)) * 100)}%)` : 'Dominant geo traffic'}
          </p>
        </div>

        {/* Card 3: Top Device */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Top Device</span>
            <Smartphone className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold capitalize text-white">
            {activeStats?.devices?.[0]?.device_type || 'Desktop'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {activeStats?.devices?.[0]?.count ? `${activeStats.devices[0].count} clicks` : 'User-Agent Classified'}
          </p>
        </div>

        {/* Card 4: Top Referrer */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Top Referrer</span>
            <Share2 className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-lg font-bold text-white truncate" title={activeStats?.referrers?.[0]?.referrer || 'Direct'}>
            {activeStats?.referrers?.[0]?.referrer ? activeStats.referrers[0].referrer.replace('https://', '') : 'Direct'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {activeStats?.referrers?.[0]?.count || 0} referral clicks
          </p>
        </div>
      </div>

      {/* Time-Series Line / Area Chart */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-bold text-white">Click Volume Over Time</h3>
            <p className="text-xs text-slate-400">Daily click aggregation generated from partitioned PostgreSQL click_events</p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            /{selectedCode}
          </span>
        </div>

        {/* SVG Area Chart */}
        <div className="h-64 w-full relative">
          {activeStats?.per_day && activeStats.per_day.length > 0 ? (
            <div className="w-full h-full flex flex-col justify-between">
              {/* Chart SVG */}
              <div className="flex-1 relative">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 500 150">
                  <defs>
                    <linearGradient id="clickGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  {[0, 50, 100, 150].map((y) => (
                    <line key={y} x1="0" y1={y} x2="500" y2={y} stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
                  ))}

                  {/* Area fill */}
                  <polygon
                    points={`0,150 ${activeStats.per_day
                      .map((d, idx) => {
                        const x = (idx / (activeStats.per_day.length - 1 || 1)) * 500;
                        const y = 150 - (d.count / maxDayCount) * 130;
                        return `${x},${y}`;
                      })
                      .join(' ')} 500,150`}
                    fill="url(#clickGrad)"
                  />

                  {/* Line */}
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={activeStats.per_day
                      .map((d, idx) => {
                        const x = (idx / (activeStats.per_day.length - 1 || 1)) * 500;
                        const y = 150 - (d.count / maxDayCount) * 130;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />

                  {/* Data Points */}
                  {activeStats.per_day.map((d, idx) => {
                    const x = (idx / (activeStats.per_day.length - 1 || 1)) * 500;
                    const y = 150 - (d.count / maxDayCount) * 130;
                    return (
                      <g key={d.date} className="cursor-pointer group">
                        <circle cx={x} cy={y} r="4" fill="#0f172a" stroke="#10b981" strokeWidth="2.5" />
                        <title>{`${d.date}: ${d.count} clicks`}</title>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* X Axis Dates */}
              <div className="flex justify-between pt-3 text-[10px] font-mono text-slate-400 border-t border-slate-800">
                {activeStats.per_day.map((d) => (
                  <span key={d.date}>{d.date.slice(5)}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              No click events recorded for this timeframe yet.
            </div>
          )}
        </div>
      </div>

      {/* Breakdowns Grid: Devices & Countries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Device Types */}
        <div className="glass-card p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-2 mb-4">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <h4 className="font-bold text-sm text-white">Device Breakdown</h4>
          </div>

          <div className="space-y-3">
            {(activeStats?.devices || [
              { device_type: 'desktop', count: 512 },
              { device_type: 'mobile', count: 286 },
              { device_type: 'tablet', count: 44 },
            ]).map((dev) => {
              const pct = Math.round((dev.count / (totalClicks || 1)) * 100);
              const Icon = dev.device_type === 'mobile' ? Smartphone : dev.device_type === 'tablet' ? Tablet : dev.device_type === 'bot' ? Bot : Monitor;
              return (
                <div key={dev.device_type}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="capitalize text-slate-300 font-medium flex items-center space-x-1.5">
                      <Icon className="w-3.5 h-3.5 text-slate-400" />
                      <span>{dev.device_type}</span>
                    </span>
                    <span className="font-mono text-slate-400">
                      {dev.count.toLocaleString()} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Geographic Countries */}
        <div className="glass-card p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-2 mb-4">
            <Globe2 className="w-4 h-4 text-sky-400" />
            <h4 className="font-bold text-sm text-white">Top Geographies (ISO 3166-1)</h4>
          </div>

          <div className="space-y-2.5">
            {(activeStats?.countries || [
              { country: 'US', count: 395 },
              { country: 'DE', count: 142 },
              { country: 'IN', count: 110 },
              { country: 'GB', count: 98 },
            ]).slice(0, 5).map((c) => {
              const pct = Math.round((c.count / (totalClicks || 1)) * 100);
              return (
                <div key={c.country} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
                  <div className="flex items-center space-x-2 font-mono font-semibold text-slate-200">
                    <span className="w-6 text-center text-xs py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700">
                      {c.country}
                    </span>
                    <span>Country {c.country}</span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="font-bold text-white">{c.count}</span>
                    <span className="text-[11px] text-slate-400 ml-1.5">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
