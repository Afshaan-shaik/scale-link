import React from 'react';
import { 
  Link2, 
  BarChart3, 
  Key, 
  Server, 
  Zap, 
  ListFilter,
  Activity,
  Plus
} from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  linksCount: number;
  workspaceId?: string;
  onTransferWorkspace?: () => void;
  onStartNewWorkspace?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  activeTab, 
  setActiveTab, 
  linksCount,
  workspaceId,
  onTransferWorkspace,
  onStartNewWorkspace,
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

  const shortWs = workspaceId ? `ws:${workspaceId.slice(0, 6)}` : 'ws:ready';

  return (
    <div className="w-full">
      {/* Top Header Row */}
      <header className="py-[36px] pb-[28px] flex flex-wrap gap-[28px] items-center justify-between">
        {/* Brand / Logo */}
        <div 
          className="flex items-center gap-[18px] cursor-pointer select-none"
          onClick={() => setActiveTab('shorten')}
        >
          <div className="luxe-logo">
            <svg viewBox="0 0 24 24" className="w-[26px] h-[26px] stroke-[#04130e] fill-none stroke-[2.4]">
              <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>
            </svg>
          </div>
          <div>
            <h1 className="text-white flex items-center">
              ScaleLink
              <span className="luxe-badge">100M scale</span>
            </h1>
            <p className="text-[var(--mut)] text-[14px]">Production URL shortener &amp; click analytics</p>
          </div>
        </div>

        {/* Side Controls */}
        <div className="flex gap-[14px] items-center flex-wrap">
          <span 
            className="luxe-pill" 
            title={`Workspace ID: ${workspaceId || 'Initializing'}`}
          >
            {shortWs}
          </span>
          {onTransferWorkspace && (
            <button 
              onClick={onTransferWorkspace}
              className="luxe-btn"
              title="Transfer workspace to another device or browser"
            >
              Transfer
            </button>
          )}
          {onStartNewWorkspace && (
            <button 
              onClick={onStartNewWorkspace}
              className="luxe-btn px-4"
              title="Start a fresh anonymous workspace for this tab"
              aria-label="New workspace"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Tab Navigation - One rounded 22px bar */}
      <nav id="nav" className="luxe-nav" aria-label="Main Navigation">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={isActive ? 'on' : ''}
              data-t={tab.id}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="luxe-cnt">{tab.count}</span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
