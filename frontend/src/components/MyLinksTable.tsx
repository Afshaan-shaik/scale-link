import React, { useState } from 'react';
import QRCode from 'qrcode';
import { 
  Search, 
  Copy, 
  Check, 
  ExternalLink, 
  Trash2, 
  BarChart2, 
  QrCode, 
  Clock, 
  AlertTriangle,
  Link2,
  Calendar
} from 'lucide-react';
import { Link, recordLinkClick } from '../api';

interface MyLinksTableProps {
  links: Link[];
  onDeleteLink: (id: string) => void;
  onViewStats: (code: string) => void;
  onNavigateToCreate: () => void;
  onLinkClick?: (code: string) => void;
}

export const MyLinksTable: React.FC<MyLinksTableProps> = ({ 
  links, 
  onDeleteLink, 
  onViewStats, 
  onNavigateToCreate,
  onLinkClick
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeQrModal, setActiveQrModal] = useState<{ code: string; url: string; qrData: string } | null>(null);

  const handleLinkOpen = (code: string) => {
    recordLinkClick(code);
    onLinkClick?.(code);
    fetch(`/api/links?code=${encodeURIComponent(code)}&click=true`).catch(() => {});
    fetch('/api/links/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links: [links.find((l) => l.code === code)].filter(Boolean) }),
    }).catch(() => {});
  };

  const filteredLinks = links.filter(
    (l) =>
      l.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.long_url.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShowQr = async (link: Link) => {
    try {
      const dataUrl = await QRCode.toDataURL(link.short_url, {
        width: 256,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      setActiveQrModal({ code: link.code, url: link.short_url, qrData: dataUrl });
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Shortened Links Inventory</h2>
          <p className="text-xs text-slate-400">Total {links.length} links tracked with partial indexes in PostgreSQL</p>
        </div>

        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by code or destination URL..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>
      </div>

      {/* Empty State */}
      {filteredLinks.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border border-slate-800">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-4">
            <Link2 className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white">No short links found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-6">
            {searchTerm ? 'No links match your search filter.' : 'Paste a long URL and press Shorten to create your first link.'}
          </p>
          <button
            onClick={onNavigateToCreate}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-500/20"
          >
            Create Your First Short Link
          </button>
        </div>
      ) : (
        /* Table / Card List */
        <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="divide-y divide-slate-800/80">
            {filteredLinks.map((link) => {
              const isCopied = copiedId === link.id;
              return (
                <div
                  key={link.id}
                  className="p-4 sm:p-5 hover:bg-slate-900/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left: Code, Long URL, metadata */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center space-x-2.5">
                      <a
                        href={link.short_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => handleLinkOpen(link.code)}
                        className="font-mono text-sm font-bold text-emerald-400 hover:underline cursor-pointer"
                        title={`Short link: ${link.short_url}`}
                      >
                        /{link.code}
                      </a>
                      {link.is_custom && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                          Custom Alias
                        </span>
                      )}
                      {link.is_expired ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>410 Expired</span>
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          Active
                        </span>
                      )}
                    </div>

                    {/* Destination Long URL: Direct clickable destination */}
                    <a
                      href={link.long_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => handleLinkOpen(link.code)}
                      className="text-xs text-slate-300 hover:text-emerald-400 truncate max-w-xl font-mono flex items-center space-x-1.5 transition-colors group cursor-pointer"
                      title={`Open destination: ${link.long_url}`}
                    >
                      <span className="truncate group-hover:underline">{link.long_url}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 shrink-0 inline ml-1 transition-colors" />
                    </a>

                    {/* Timestamps */}
                    <div className="flex items-center space-x-4 text-[11px] text-slate-500">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>Created {new Date(link.created_at).toLocaleDateString()}</span>
                      </span>
                      {link.expires_at && (
                        <span className="flex items-center space-x-1 text-amber-400/80">
                          <Clock className="w-3 h-3" />
                          <span>Expires {new Date(link.expires_at).toLocaleDateString()}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Metrics & Actions */}
                  <div className="flex items-center justify-between md:justify-end space-x-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                    {/* Click Count Badge */}
                    <div
                      onClick={() => onViewStats(link.code)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 cursor-pointer hover:border-emerald-500/40 transition-colors text-right"
                      title="Click to view analytics"
                    >
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Clicks</div>
                      <div className="text-sm font-bold font-mono text-emerald-400">
                        {link.click_count.toLocaleString()}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleCopy(link.id, link.short_url)}
                        className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/60"
                        title="Copy short link"
                      >
                        {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>

                      {/* Open Destination in new tab */}
                      <a
                        href={link.long_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => handleLinkOpen(link.code)}
                        className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-colors border border-emerald-500/30"
                        title="Open destination in new tab"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>

                      <button
                        onClick={() => handleShowQr(link)}
                        className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/60"
                        title="QR Code"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onViewStats(link.code)}
                        className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/60"
                        title="Analytics"
                      >
                        <BarChart2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onDeleteLink(link.id)}
                        className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors border border-rose-500/20"
                        title="Soft delete link"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {activeQrModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl relative animate-scaleUp">
            <h4 className="text-base font-bold text-white mb-1">Scan Short Link</h4>
            <p className="text-xs text-slate-400 mb-4 font-mono">/{activeQrModal.code}</p>

            <div className="bg-white p-4 rounded-xl mx-auto inline-block shadow-inner">
              <img src={activeQrModal.qrData} alt="QR Code" className="w-52 h-52 mx-auto" />
            </div>

            <p className="text-[11px] text-slate-400 font-mono mt-3 select-all truncate">{activeQrModal.url}</p>

            <button
              onClick={() => setActiveQrModal(null)}
              className="mt-5 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
