import React from 'react';
import { 
  Link2, 
  BarChart3, 
  Key, 
  Server, 
  Zap, 
  ListFilter,
  Activity
} from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  linksCount: number;
}

export const Header: React.FC<HeaderProps> = ({ 
  activeTab, 
  setActiveTab, 
  linksCount,
}) => {
  const tabs = [
    { id: 'shorten', label: 'Shorten', icon: Link2 },
    { id: 'links', label: 'My Links', icon: ListFilter, count: linksCount },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'ratelimit', label: 'Token Bucket', icon: Zap },
    { id: 'keys', label: 'API Keys', icon: Key },
    { id: 'system', label: 'System', icon: Server },
    { id: 'observability', label: 'Observability', icon: Activity },
  ];

  const productionHost =
    typeof window !== 'undefined' && window.location.hostname !== 'localhost'
      ? window.location.hostname
      : 'localhost:8080';

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Tagline - Spacious and clean */}
          <div 
            className="flex items-center space-x-3.5 cursor-pointer py-1 select-none" 
            onClick={() => setActiveTab('shorten')}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
              <Link2 className="w-6 h-6 text-slate-950 font-bold stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-white">
                  Scale<span className="text-emerald-400">Link</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Production URL Shortener & Click Analytics</p>
            </div>
          </div>

          {/* Navigation Tabs - Generous spacing & breathing room */}
          <nav className="hidden md:flex items-center space-x-1.5 lg:space-x-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Status Badge - Spacious & Uncrowded */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-850 border border-slate-700/60 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-300 font-mono text-xs">{productionHost}</span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex md:hidden overflow-x-auto py-2.5 space-x-1.5 scrollbar-none border-t border-slate-800/60">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="text-[10px] px-1 rounded-full bg-slate-800 text-slate-300">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
