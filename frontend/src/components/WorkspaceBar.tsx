import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Share2, 
  Plus, 
  Copy, 
  Check, 
  Layers
} from 'lucide-react';

interface WorkspaceBarProps {
  workspaceId?: string;
  linksCount: number;
  onTransferWorkspace: () => void;
  onStartNewWorkspace: () => void;
}

export const WorkspaceBar: React.FC<WorkspaceBarProps> = ({
  workspaceId,
  linksCount,
  onTransferWorkspace,
  onStartNewWorkspace,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyWorkspaceId = () => {
    if (!workspaceId) return;
    navigator.clipboard.writeText(workspaceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Workspace Identity & Isolation Info */}
          <div className="flex items-center flex-wrap gap-2.5">
            <div 
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-300 shadow-sm"
              title={`Anonymous Workspace ID: ${workspaceId || 'Loading'}`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-slate-400 font-sans font-medium text-[11px]">Workspace:</span>
              <span className="font-bold tracking-tight">
                {workspaceId ? `ws:${workspaceId.slice(0, 8)}...` : 'Connecting...'}
              </span>
              {workspaceId && (
                <button
                  onClick={handleCopyWorkspaceId}
                  className="ml-1 p-0.5 text-emerald-400/70 hover:text-emerald-300 hover:bg-emerald-500/20 rounded transition-colors"
                  title="Copy full Workspace ID"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            <div className="hidden md:flex items-center space-x-2 text-xs text-slate-400 bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-700/40">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-300 font-medium">Tab & Device Isolated</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">Zero Login</span>
            </div>

            <div className="flex items-center space-x-1.5 text-xs text-slate-400 bg-slate-800/30 px-3 py-1.5 rounded-xl border border-slate-700/30 font-medium">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>
                <strong className="text-slate-200">{linksCount}</strong> Saved {linksCount === 1 ? 'URL' : 'URLs'}
              </span>
            </div>
          </div>

          {/* Right: Transfer & New Workspace Action Buttons */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <button
              onClick={onTransferWorkspace}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700/80 shadow-sm transition-all hover:border-cyan-500/40 active:scale-95 group"
              title="Transfer this workspace to mobile or another browser via one-time link or QR code"
            >
              <Share2 className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span>Transfer Workspace</span>
            </button>

            <button
              onClick={onStartNewWorkspace}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-750 transition-all hover:border-slate-600 active:scale-95"
              title="Start a fresh anonymous workspace for this tab"
            >
              <Plus className="w-3.5 h-3.5 text-slate-400" />
              <span>New Workspace</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
