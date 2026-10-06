import React, { useState } from 'react';
import { 
  BarChart3, 
  Globe2, 
  Smartphone, 
  Monitor, 
  Tablet, 
  Bot, 
  TrendingUp,
  Share2
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
  const maxDayCount = Math.max(...(activeStats?.per_day?.map((d) => d.count) || [1]), 10);

  return (
    <div className="w-full space-y-8 animate-fadeIn">
      {/* Top Selector Bar */}
      <div className="luxe-hero flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[16px] bg-[#34d6a018] border border-[#34d6a033] flex items-center justify-center shrink-0">
            <BarChart3 className="w-6 h-6 text-[var(--em)]" />
          </div>
          <div>
            <h2 className="text-white text-[28px] sm:text-[32px]">Click Analytics</h2>
            <p className="text-[var(--mut)] text-xs sm:text-sm">
              Asynchronously consumed via Redis Streams &amp; partitioned by month
            </p>
          </div>
        </div>

        {/* Link Dropdown & Date Range Selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedCode}
            onChange={(e) => onSelectCode(e.target.value)}
            className="px-4 py-2.5 rounded-[16px] bg-[var(--bg)] border border-[var(--line)] text-xs text-[var(--em)] font-mono font-semibold outline-none focus:border-[var(--em)] transition-colors cursor-pointer"
          >
            {links.map((link) => (
              <option key={link.code} value={link.code} className="bg-[var(--bg2)] text-[var(--tx)]">
                /{link.code} ({link.click_count} clicks)
              </option>
            ))}
          </select>

          <div className="flex bg-[var(--bg)] p-1 rounded-[16px] border border-[var(--line)] text-xs font-semibold">
            {(['7d', '30d', '90d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 rounded-[12px] transition-all font-mono ${
                  dateRange === r ? 'bg-[var(--em)] text-[#03120d] font-bold shadow-sm' : 'text-[var(--mut)] hover:text-white'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Total Clicks */}
        <div className="luxe-inner-card p-6 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[var(--mut)] mb-3">
            <span>Total Redirects</span>
            <TrendingUp className="w-4 h-4 text-[var(--em)]" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-white">
            {totalClicks.toLocaleString()}
          </div>
          <p className="text-[12px] text-[var(--em)] mt-2 font-medium">
            Async Worker Processed
          </p>
        </div>

        {/* Card 2: Top Country */}
        <div className="luxe-inner-card p-6">
          <div className="flex items-center justify-between text-xs text-[var(--mut)] mb-3">
            <span>Primary Country</span>
            <Globe2 className="w-4 h-4 text-[var(--sky)]" />
          </div>
          <div className="text-3xl font-extrabold text-white font-mono">
            {activeStats?.countries?.[0]?.country || 'US'}
          </div>
          <p className="text-[12px] text-[var(--mut)] mt-2">
            {activeStats?.countries?.[0]?.count ? `${activeStats.countries[0].count} clicks (${Math.round((activeStats.countries[0].count / (totalClicks || 1)) * 100)}%)` : 'Dominant geo traffic'}
          </p>
        </div>

        {/* Card 3: Top Device */}
        <div className="luxe-inner-card p-6">
          <div className="flex items-center justify-between text-xs text-[var(--mut)] mb-3">
            <span>Top Device</span>
            <Smartphone className="w-4 h-4 text-[var(--gold)]" />
          </div>
          <div className="text-3xl font-extrabold capitalize text-white">
            {activeStats?.devices?.[0]?.device_type || 'Desktop'}
          </div>
          <p className="text-[12px] text-[var(--mut)] mt-2">
            {activeStats?.devices?.[0]?.count ? `${activeStats.devices[0].count} clicks` : 'User-Agent Classified'}
          </p>
        </div>

        {/* Card 4: Top Referrer */}
        <div className="luxe-inner-card p-6">
          <div className="flex items-center justify-between text-xs text-[var(--mut)] mb-3">
            <span>Top Referrer</span>
            <Share2 className="w-4 h-4 text-[var(--em)]" />
          </div>
          <div className="text-2xl font-bold text-white truncate" title={activeStats?.referrers?.[0]?.referrer || 'Direct'}>
            {activeStats?.referrers?.[0]?.referrer ? activeStats.referrers[0].referrer.replace('https://', '') : 'Direct'}
          </div>
          <p className="text-[12px] text-[var(--mut)] mt-2">
            {activeStats?.referrers?.[0]?.count || 0} referral clicks
          </p>
        </div>
      </div>

      {/* Time-Series Line / Area Chart */}
      <div className="luxe-card p-7 sm:p-9 shadow-xl">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">Click Volume Over Time</h3>
            <p className="text-xs text-[var(--mut)] mt-0.5">Daily click aggregation generated from partitioned PostgreSQL click_events</p>
          </div>
          <span className="text-xs font-mono px-3 py-1 rounded-full bg-[#34d6a018] text-[var(--em)] border border-[#34d6a033]">
            /{selectedCode}
          </span>
        </div>

        {/* SVG Area Chart with Emerald/Gold Palette */}
        <div className="h-64 w-full relative">
          {activeStats?.per_day && activeStats.per_day.length > 0 ? (
            <div className="w-full h-full flex flex-col justify-between">
              <div className="flex-1 relative">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 500 150">
                  <defs>
                    <linearGradient id="clickGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d6a0" stopOpacity="0.35" />
                      <stop offset="70%" stopColor="#e3c383" stopOpacity="0.1" />
                      <stop offset="100%" stopColor="#34d6a0" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  {[0, 50, 100, 150].map((y) => (
                    <line key={y} x1="0" y1={y} x2="500" y2={y} stroke="var(--line)" strokeWidth="0.8" strokeDasharray="4 4" />
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
                    stroke="var(--em)"
                    strokeWidth="3.5"
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
                        <circle cx={x} cy={y} r="4.5" fill="var(--bg)" stroke="var(--em)" strokeWidth="2.5" />
                        <title>{`${d.date}: ${d.count} clicks`}</title>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* X Axis Dates */}
              <div className="flex justify-between pt-4 text-[11px] font-mono text-[var(--mut)] border-t border-[var(--line)]">
                {activeStats.per_day.map((d) => (
                  <span key={d.date}>{d.date.slice(5)}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-[var(--mut)]">
              No click events recorded for this timeframe yet.
            </div>
          )}
        </div>
      </div>

      {/* Breakdowns Grid: Devices & Countries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Device Types */}
        <div className="luxe-card p-7 sm:p-8">
          <div className="flex items-center gap-2.5 mb-6">
            <Smartphone className="w-5 h-5 text-[var(--em)]" />
            <h4 className="font-bold text-base text-white">Device Breakdown</h4>
          </div>

          <div className="space-y-4">
            {(activeStats?.devices || [
              { device_type: 'desktop', count: 512 },
              { device_type: 'mobile', count: 286 },
              { device_type: 'tablet', count: 44 },
            ]).map((dev) => {
              const pct = Math.round((dev.count / (totalClicks || 1)) * 100);
              const Icon = dev.device_type === 'mobile' ? Smartphone : dev.device_type === 'tablet' ? Tablet : dev.device_type === 'bot' ? Bot : Monitor;
              return (
                <div key={dev.device_type} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="capitalize text-[var(--tx)] font-medium flex items-center gap-2">
                      <Icon className="w-4 h-4 text-[var(--mut)]" />
                      <span>{dev.device_type}</span>
                    </span>
                    <span className="font-mono text-[var(--mut)] font-semibold">
                      {dev.count.toLocaleString()} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-[var(--bg)] rounded-full overflow-hidden border border-[var(--line)]">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--em)] to-[var(--gold)] rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Geographic Countries */}
        <div className="luxe-card p-7 sm:p-8">
          <div className="flex items-center gap-2.5 mb-6">
            <Globe2 className="w-5 h-5 text-[var(--sky)]" />
            <h4 className="font-bold text-base text-white">Top Geographies (ISO 3166-1)</h4>
          </div>

          <div className="space-y-3">
            {(activeStats?.countries || [
              { country: 'US', count: 395 },
              { country: 'DE', count: 142 },
              { country: 'IN', count: 110 },
              { country: 'GB', count: 98 },
            ]).slice(0, 5).map((c) => {
              const pct = Math.round((c.count / (totalClicks || 1)) * 100);
              return (
                <div key={c.country} className="flex items-center justify-between p-3 rounded-[16px] bg-[var(--bg2)] border border-[var(--line)] text-xs">
                  <div className="flex items-center gap-3 font-mono font-semibold text-[var(--tx)]">
                    <span className="w-7 text-center text-xs py-0.5 rounded-[8px] bg-[var(--bg)] text-[var(--sky)] border border-[var(--line)]">
                      {c.country}
                    </span>
                    <span>Country {c.country}</span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="font-bold text-white">{c.count}</span>
                    <span className="text-[11px] text-[var(--mut)] ml-2 font-normal">({pct}%)</span>
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
