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
  Calendar,
  Share2,
  Plus
} from 'lucide-react';
import { Link, recordLinkClick } from '../api';
import { sessionFetch } from '../session';

interface MyLinksTableProps {
  links: Link[];
  onDeleteLink: (id: string) => void;
  onViewStats: (code: string) => void;
  onNavigateToCreate: () => void;
  onLinkClick?: (code: string) => void;
  workspaceId?: string;
  onTransferWorkspace?: () => void;
  onStartNewWorkspace?: () => void;
}

export const MyLinksTable: React.FC<MyLinksTableProps> = ({ 
  links, 
  onDeleteLink, 
  onViewStats, 
  onNavigateToCreate,
  onLinkClick,
  workspaceId,
  onTransferWorkspace,
  onStartNewWorkspace
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeQrModal, setActiveQrModal] = useState<{ code: string; url: string; qrData: string } | null>(null);

  const handleLinkOpen = (code: string) => {
    recordLinkClick(code);
    onLinkClick?.(code);
    sessionFetch(`/api/links?code=${encodeURIComponent(code)}&click=true`).catch(() => {});
    sessionFetch('/api/links/sync', {
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
        color: { dark: '#07100e', light: '#eaf3ef' },
      });
      setActiveQrModal({ code: link.code, url: link.short_url, qrData: dataUrl });
    } catch {
      // ignore
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Top Controls: Title, Search, and Workspace buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-white text-[28px] sm:text-[34px]">Saved URLs</h2>
            {workspaceId && (
              <span className="font-mono text-[12px] text-[var(--em)] border border-[#34d6a044] rounded-full px-3 py-0.5">
                ws:{workspaceId.slice(0, 6)}
              </span>
            )}
          </div>
          <p className="text-[var(--mut)] text-[14px] mt-1">
            Isolated anonymous workspace • {links.length} saved URLs
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {onTransferWorkspace && (
            <button
              onClick={onTransferWorkspace}
              className="luxe-btn py-2 px-4 text-xs font-semibold"
              title="Transfer workspace to another device via QR code or link"
            >
              <Share2 className="w-3.5 h-3.5 text-[var(--sky)]" />
              <span>Transfer</span>
            </button>
          )}

          {onStartNewWorkspace && (
            <button
              onClick={onStartNewWorkspace}
              className="luxe-btn py-2 px-3.5 text-xs font-semibold"
              title="Start a fresh anonymous workspace for this tab"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          )}

          <div className="relative min-w-[220px] sm:min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--mut)] pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search saved links…"
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg)] border border-[var(--line)] rounded-[16px] text-xs text-[var(--tx)] placeholder-[var(--mut)] outline-none focus:border-[var(--em)] focus:shadow-[0_0_0_4px_#34d6a014] transition-all font-sans"
            />
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredLinks.length === 0 ? (
        <div className="border border-dashed border-[var(--line)] rounded-[36px] p-12 sm:p-20 text-center bg-[var(--bg2)] shadow-[var(--shadow)]">
          <div className="w-14 h-14 rounded-[18px] bg-[#34d6a018] border border-[#34d6a033] text-[var(--em)] mx-auto grid place-items-center mb-4">
            <Link2 className="w-7 h-7" />
          </div>
          <h2 className="text-white text-[28px]">No short links found</h2>
          <p className="text-[var(--mut)] text-sm max-w-sm mx-auto mt-2 mb-6">
            {searchTerm ? 'No links match your search filter.' : 'Paste a long URL and press Shorten to create your first link.'}
          </p>
          <button
            onClick={onNavigateToCreate}
            className="luxe-go py-3 px-6 text-sm"
          >
            Create Your First Short Link
          </button>
        </div>
      ) : (
        /* List with 20px x 26px padding and 16px gaps */
        <div className="grid gap-[16px]">
          {filteredLinks.map((link) => {
            const isCopied = copiedId === link.id;
            return (
              <div
                key={link.id}
                className="luxe-row"
              >
                {/* Left: Code, Long URL, metadata */}
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <a
                      href={link.short_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => handleLinkOpen(link.code)}
                      className="font-mono text-[16px] font-bold text-[var(--em)] hover:underline cursor-pointer"
                      title={`Short link: ${link.short_url}`}
                    >
                      /{link.code}
                    </a>

                    {link.is_custom && (
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-[8px] bg-[#6cc8f018] text-[var(--sky)] border border-[#6cc8f033] font-medium">
                        Custom Alias
                      </span>
                    )}

                    {link.is_expired ? (
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-[8px] bg-[#f0b44c18] text-[var(--amber)] border border-[#f0b44c33] font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>410 Expired</span>
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-[8px] bg-[#34d6a018] text-[var(--em)] border border-[#34d6a033] font-medium">
                        Active
                      </span>
                    )}
                  </div>

                  {/* Destination Long URL */}
                  <a
                    href={link.long_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => handleLinkOpen(link.code)}
                    className="text-[14px] text-[var(--mut)] hover:text-[var(--em)] truncate max-w-xl font-mono flex items-center gap-1.5 transition-colors group cursor-pointer"
                    title={`Open destination: ${link.long_url}`}
                  >
                    <span className="truncate group-hover:underline">{link.long_url}</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 shrink-0 inline ml-1 transition-opacity" />
                  </a>

                  {/* Timestamps */}
                  <div className="flex items-center gap-4 text-[12px] text-[var(--mut)] font-mono">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 opacity-70" />
                      <span>Created {new Date(link.created_at).toLocaleDateString()}</span>
                    </span>
                    {link.expires_at && (
                      <span className="flex items-center gap-1 text-[var(--amber)]">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Expires {new Date(link.expires_at).toLocaleDateString()}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Metrics & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-[var(--line)]">
                  {/* Click Count Badge */}
                  <div
                    onClick={() => onViewStats(link.code)}
                    className="px-3.5 py-1.5 rounded-[14px] bg-[var(--bg2)] border border-[var(--line)] cursor-pointer hover:border-[var(--em)] transition-colors text-right"
                    title="Click to view analytics"
                  >
                    <div className="text-[10px] uppercase font-bold text-[var(--mut)] tracking-wider">Clicks</div>
                    <div className="text-[15px] font-bold font-mono text-[var(--em)]">
                      {link.click_count.toLocaleString()}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleCopy(link.id, link.short_url)}
                      className="luxe-btn p-2.5 rounded-[12px]"
                      title="Copy short link"
                    >
                      {isCopied ? <Check className="w-4 h-4 text-[var(--em)]" /> : <Copy className="w-4 h-4" />}
                    </button>

                    <a
                      href={link.long_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => handleLinkOpen(link.code)}
                      className="luxe-btn p-2.5 rounded-[12px] text-[var(--em)] border-[#34d6a044]"
                      title="Open destination in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>

                    <button
                      onClick={() => handleShowQr(link)}
                      className="luxe-btn p-2.5 rounded-[12px]"
                      title="QR Code"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onViewStats(link.code)}
                      className="luxe-btn p-2.5 rounded-[12px]"
                      title="Analytics"
                    >
                      <BarChart2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onDeleteLink(link.id)}
                      className="luxe-btn p-2.5 rounded-[12px] text-rose-400 border-rose-500/20 hover:border-rose-400"
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
      )}

      {/* QR Code Modal */}
      {activeQrModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="luxe-card p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl relative animate-fadeIn">
            <h2 className="text-white text-[24px] mb-1">Scan Short Link</h2>
            <p className="text-xs text-[var(--mut)] mb-5 font-mono">/{activeQrModal.code}</p>

            <div className="bg-[var(--bg)] p-4 rounded-[20px] mx-auto inline-block border border-[var(--line)]">
              <img src={activeQrModal.qrData} alt="QR Code" className="w-48 h-48 mx-auto rounded-[12px]" />
            </div>

            <p className="text-[12px] text-[var(--em)] font-mono mt-4 select-all truncate">{activeQrModal.url}</p>

            <button
              onClick={() => setActiveQrModal(null)}
              className="mt-6 w-full luxe-btn justify-center py-2.5 font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
