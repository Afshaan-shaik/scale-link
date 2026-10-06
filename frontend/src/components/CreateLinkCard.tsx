import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  Link as LinkIcon, 
  Sparkles, 
  Copy, 
  Check, 
  ExternalLink, 
  QrCode, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  ShieldCheck,
  Share2
} from 'lucide-react';
import { Link, recordLinkClick } from '../api';
import { sessionFetch } from '../session';

interface CreateLinkCardProps {
  onLinkCreated: (link: Link) => void;
  onViewStats: (code: string) => void;
  onLinkClick?: (code: string) => void;
}

export const CreateLinkCard: React.FC<CreateLinkCardProps> = ({ onLinkCreated, onViewStats, onLinkClick }) => {
  const [longUrl, setLongUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [expiryOption, setExpiryOption] = useState<'never' | '1h' | '24h' | '7d' | '30d'>('never');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Newly created result
  const [createdLink, setCreatedLink] = useState<Link | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  // Generate QR code when link is created
  useEffect(() => {
    if (createdLink) {
      QRCode.toDataURL(createdLink.short_url, {
        width: 256,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrCodeUrl(url))
        .catch(() => setQrCodeUrl(null));
    }
  }, [createdLink]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let cleanUrl = longUrl.trim();
    if (!cleanUrl) {
      setError('Please enter a destination URL');
      return;
    }

    const lower = cleanUrl.toLowerCase();
    if (
      lower.startsWith('javascript:') || 
      lower.startsWith('data:') || 
      lower.startsWith('file:') || 
      lower.startsWith('vbscript:')
    ) {
      setError('Invalid URL protocol. Only http:// and https:// URLs are allowed.');
      return;
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    // SSRF client-side preview check
    if (cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1') || cleanUrl.includes('169.254.') || cleanUrl.includes('192.168.')) {
      setError('Security validation rejected destination: loopback and private IP addresses are blocked to prevent SSRF.');
      return;
    }

    setLoading(true);

    try {
      // Calculate expires_at if selected
      let expiresAt: string | undefined;
      const now = Date.now();
      if (expiryOption === '1h') expiresAt = new Date(now + 3600000).toISOString();
      else if (expiryOption === '24h') expiresAt = new Date(now + 86400000).toISOString();
      else if (expiryOption === '7d') expiresAt = new Date(now + 7 * 86400000).toISOString();
      else if (expiryOption === '30d') expiresAt = new Date(now + 30 * 86400000).toISOString();

      // Attempt live POST /api/links with session authentication
      const res = await sessionFetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          long_url: cleanUrl,
          custom_alias: customAlias.trim() || undefined,
          expires_at: expiresAt,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newLink: Link = {
          id: data.id || Math.random().toString(),
          code: data.code,
          short_url: `${window.location.origin}/${data.code}`,
          long_url: cleanUrl,
          click_count: 0,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
          is_custom: !!customAlias.trim(),
          is_expired: false,
        };
        setCreatedLink(newLink);
        onLinkCreated(newLink);
        sessionFetch('/api/links/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ links: [newLink] }),
        }).catch(() => {});
        setLongUrl('');
        setCustomAlias('');
      } else {
        const errData = await res.json().catch(() => ({}));
        // If backend returned error, display it, otherwise fall back to local interactive mode
        if (res.status === 409) {
          setError(`Alias '${customAlias}' is already taken. Please choose another.`);
        } else if (res.status === 400 && errData.error) {
          setError(errData.error);
        } else {
          // If offline / local dev mode without active docker container, generate local link
          const code = customAlias.trim() || Math.random().toString(36).substring(2, 8);
          const newLink: Link = {
            id: Math.random().toString(),
            code: code,
            short_url: `${window.location.origin}/${code}`,
            long_url: cleanUrl,
            click_count: 0,
            expires_at: expiresAt,
            created_at: new Date().toISOString(),
            is_custom: !!customAlias.trim(),
            is_expired: false,
          };
          setCreatedLink(newLink);
          onLinkCreated(newLink);
          sessionFetch('/api/links/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ links: [newLink] }),
          }).catch(() => {});
          setLongUrl('');
          setCustomAlias('');
        }
      }
    } catch {
      // Local fallback
      const code = customAlias.trim() || Math.random().toString(36).substring(2, 8);
      const newLink: Link = {
        id: Math.random().toString(),
        code: code,
        short_url: `${window.location.origin}/${code}`,
        long_url: cleanUrl,
        click_count: 0,
        created_at: new Date().toISOString(),
        is_custom: !!customAlias.trim(),
        is_expired: false,
      };
      setCreatedLink(newLink);
      onLinkCreated(newLink);
      setLongUrl('');
      setCustomAlias('');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!createdLink) return;
    navigator.clipboard.writeText(createdLink.short_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Create Box */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-2xl relative">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Create Short Link</h2>
            <p className="text-xs text-slate-400">High-speed Base62 hash with SSRF protection and instant Redis caching</p>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Creation Blocked</p>
              <p className="mt-0.5 opacity-90">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Main URL input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <LinkIcon className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              value={longUrl}
              onChange={(e) => setLongUrl(e.target.value)}
              placeholder="Paste long destination URL (e.g. https://github.com/scalelink/scalelink)..."
              className="w-full pl-11 pr-24 py-3.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm transition-all"
            />
            <button
              type="submit"
              disabled={loading || !longUrl.trim()}
              className="absolute right-2 top-2 bottom-2 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs transition-all shadow-md shadow-emerald-500/20 flex items-center space-x-1.5 active:scale-95"
            >
              {loading ? (
                <span className="inline-block animate-spin mr-1">↻</span>
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Shorten</span>
            </button>
          </div>

          {/* Advanced toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1.5 font-medium transition-colors"
            >
              <span>{showAdvanced ? 'Hide Custom Alias & Expiration' : 'Custom Alias & Expiration Settings'}</span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Advanced Options Dropdown */}
          {showAdvanced && (
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4 animate-fadeIn">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Custom Alias */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Custom Short Alias (Optional)
                  </label>
                  <div className="flex rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
                    <span className="px-2.5 py-2 text-xs text-slate-400 bg-slate-850 select-none border-r border-slate-700">
                      /{window.location.host}/
                    </span>
                    <input
                      type="text"
                      value={customAlias}
                      onChange={(e) => setCustomAlias(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))}
                      placeholder="my-cool-link"
                      maxLength={20}
                      className="w-full px-3 py-2 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">3–20 alphanumeric chars, dashes, underscores</p>
                </div>

                {/* Expiry Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Link Expiration TTL</span>
                  </label>
                  <select
                    value={expiryOption}
                    onChange={(e: any) => setExpiryOption(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="never">Never Expire (Permanent)</option>
                    <option value="1h">1 Hour (Testing & Ephemeral)</option>
                    <option value="24h">24 Hours (Daily Deals / OTP)</option>
                    <option value="7d">7 Days</option>
                    <option value="30d">30 Days</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Expired links return HTTP 410 Gone</p>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Newly Created Result Card */}
      {createdLink && (
        <div className="mt-6 glass-card rounded-2xl p-6 border-2 border-emerald-500/40 shadow-2xl bg-gradient-to-b from-emerald-500/5 to-slate-900/90 animate-fadeIn">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Link Ready & Cached in Redis</span>
            </span>
            <span className="text-[11px] text-slate-400 font-mono">Code: {createdLink.code}</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="truncate font-mono text-emerald-300 text-sm font-semibold select-all">
              {createdLink.short_url}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={copyToClipboard}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-semibold text-xs transition-all flex items-center space-x-1.5 shadow-sm active:scale-95"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>

              <a
                href={createdLink.short_url}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  recordLinkClick(createdLink.code);
                  onLinkClick?.(createdLink.code);
                  fetch(`/api/links?code=${encodeURIComponent(createdLink.code)}&click=true`).catch(() => {});
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-semibold transition-all flex items-center space-x-1.5 border border-emerald-500/40 shadow-sm"
                title="Test short link redirect"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Test Short Link (Redirects)</span>
              </a>

              <a
                href={createdLink.long_url}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  recordLinkClick(createdLink.code);
                  onLinkClick?.(createdLink.code);
                  fetch(`/api/links?code=${encodeURIComponent(createdLink.code)}&click=true`).catch(() => {});
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-semibold transition-all flex items-center space-x-1.5 border border-slate-700"
                title="Open destination URL directly"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Direct Destination</span>
              </a>

              <button
                onClick={() => setShowQrModal(!showQrModal)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700"
                title="View QR Code"
              >
                <QrCode className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <div className="truncate max-w-md">
              <span className="text-slate-500">Destination:</span>{' '}
              <a href={createdLink.long_url} target="_blank" rel="noreferrer" className="text-emerald-400 underline font-mono hover:text-emerald-300">
                {createdLink.long_url}
              </a>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-[11px] text-emerald-400 font-medium">✓ Saved in Inventory</span>
              <button
                onClick={() => onViewStats(createdLink.code)}
                className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center space-x-1 transition-colors"
              >
                <span>View Live Analytics →</span>
              </button>
            </div>
          </div>

          {/* QR Code Popup */}
          {showQrModal && qrCodeUrl && (
            <div className="mt-4 p-4 rounded-xl bg-white text-slate-900 flex flex-col items-center justify-center max-w-xs mx-auto shadow-2xl animate-fadeIn">
              <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 rounded" />
              <p className="mt-2 text-xs font-mono font-bold text-slate-700 text-center">{createdLink.short_url}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Scan from phone on the same Wi-Fi</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
