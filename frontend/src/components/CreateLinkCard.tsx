import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  Sparkles, 
  Copy, 
  Check, 
  ExternalLink, 
  QrCode, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle
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
          dark: '#07100e',
          light: '#eaf3ef',
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
        if (res.status === 409) {
          setError(`Alias '${customAlias}' is already taken. Please choose another.`);
        } else if (res.status === 400 && errData.error) {
          setError(errData.error);
        } else {
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
    <div className="luxe-create">
      {/* Header section with icon and title */}
      <div className="flex gap-[20px] items-center mb-[36px]">
        <div className="w-[52px] h-[52px] rounded-[16px] bg-[var(--bg)] border border-[var(--line)] grid place-items-center shrink-0">
          <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-[var(--em)] fill-none stroke-[2]">
            <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>
          </svg>
        </div>
        <div>
          <h2 className="text-white">Create short link</h2>
          <p className="text-[var(--mut)] text-[15px]">
            High-speed Base62 hash with SSRF protection and instant Redis caching
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-5 p-4 rounded-[16px] bg-[#f0b44c18] border border-[#f0b44c55] text-[var(--amber)] text-xs flex items-start space-x-2.5 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Creation Blocked</p>
            <p className="mt-0.5 opacity-90">{error}</p>
          </div>
        </div>
      )}

      {/* Main input field with docked button inside */}
      <form onSubmit={handleSubmit}>
        <div className="luxe-field">
          <input
            type="text"
            value={longUrl}
            onChange={(e) => setLongUrl(e.target.value)}
            placeholder="Paste long destination URL (e.g. https://github.com/scalelink/scalelink)…"
            aria-label="Destination URL"
          />
          <button
            type="submit"
            disabled={loading || !longUrl.trim()}
            className="luxe-go disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block animate-spin mr-2">↻</span>
            ) : null}
            <span>Shorten</span>
          </button>
        </div>

        {/* Custom alias & expiration settings */}
        <div className="mt-[28px]">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[var(--mut)] hover:text-white font-semibold text-[15px] flex items-center gap-1.5 transition-colors cursor-pointer select-none"
          >
            <span>Custom alias &amp; expiration settings</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px] mt-[22px] animate-fadeIn">
              <div>
                <input
                  type="text"
                  value={customAlias}
                  onChange={(e) => setCustomAlias(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))}
                  placeholder="Custom alias (optional)"
                  maxLength={20}
                  className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-[16px] p-[14px_18px] text-[var(--tx)] font-medium text-[15px] outline-none focus:border-[var(--em)] focus:shadow-[0_0_0_5px_#34d6a018] transition-all"
                />
              </div>

              <div>
                <select
                  value={expiryOption}
                  onChange={(e: any) => setExpiryOption(e.target.value)}
                  aria-label="Expiration"
                  className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-[16px] p-[14px_18px] text-[var(--tx)] font-medium text-[15px] outline-none focus:border-[var(--em)] focus:shadow-[0_0_0_5px_#34d6a018] transition-all cursor-pointer"
                >
                  <option value="never" className="bg-[var(--bg2)] text-[var(--tx)]">Never Expire (Permanent)</option>
                  <option value="1h" className="bg-[var(--bg2)] text-[var(--tx)]">1 Hour (Ephemeral)</option>
                  <option value="24h" className="bg-[var(--bg2)] text-[var(--tx)]">24 Hours (Daily Deals)</option>
                  <option value="7d" className="bg-[var(--bg2)] text-[var(--tx)]">7 Days</option>
                  <option value="30d" className="bg-[var(--bg2)] text-[var(--tx)]">30 Days</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </form>

      {/* Newly Created Result Card */}
      {createdLink && (
        <div className="mt-8 border border-[var(--em)] rounded-[24px] p-6 bg-[var(--bg)] shadow-[0_0_0_4px_#34d6a014,0_24px_60px_-28px_var(--em)] animate-fadeIn">
          <div className="flex items-center justify-between mb-4">
            <span className="flex items-center space-x-1.5 text-xs font-bold text-[var(--em)] uppercase tracking-wider">
              <Check className="w-4 h-4 text-[var(--em)]" />
              <span>Link Ready &amp; Cached in Redis</span>
            </span>
            <span className="text-[12px] text-[var(--mut)] font-mono">Code: /{createdLink.code}</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-[18px] bg-[var(--bg2)] border border-[var(--line)]">
            <div className="truncate font-mono text-[var(--em)] text-base font-semibold select-all">
              {createdLink.short_url}
            </div>

            <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-2">
              <button
                onClick={copyToClipboard}
                className="luxe-btn py-2 px-4 text-xs font-bold"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[var(--em)]" /> : <Copy className="w-3.5 h-3.5" />}
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
                className="luxe-btn py-2 px-4 text-xs font-bold text-[var(--em)] border-[#34d6a066]"
                title="Test short link redirect"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Test Link</span>
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
                className="luxe-btn py-2 px-4 text-xs font-bold"
                title="Open destination URL directly"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Destination</span>
              </a>

              <button
                onClick={() => setShowQrModal(!showQrModal)}
                className="luxe-btn p-2"
                title="View QR Code"
              >
                <QrCode className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--mut)]">
            <div className="truncate max-w-md">
              <span className="text-[var(--mut)]">Destination:</span>{' '}
              <a href={createdLink.long_url} target="_blank" rel="noreferrer" className="text-[var(--em)] underline font-mono hover:text-white">
                {createdLink.long_url}
              </a>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-[12px] text-[var(--em)] font-medium">✓ Saved in Inventory</span>
              <button
                onClick={() => onViewStats(createdLink.code)}
                className="text-[var(--em)] hover:underline font-semibold flex items-center space-x-1"
              >
                <span>View Live Analytics →</span>
              </button>
            </div>
          </div>

          {/* QR Code Popup */}
          {showQrModal && qrCodeUrl && (
            <div className="mt-6 p-6 rounded-[24px] bg-[var(--bg2)] border border-[var(--line)] text-center max-w-xs mx-auto shadow-2xl animate-fadeIn">
              <div className="p-3 bg-white rounded-[16px] inline-block shadow-md">
                <img src={qrCodeUrl} alt="QR Code" className="w-44 h-44 rounded-[8px]" />
              </div>
              <p className="mt-3 text-xs font-mono font-bold text-[var(--em)] truncate">{createdLink.short_url}</p>
              <p className="text-[11px] text-[var(--mut)] mt-1">Scan from your phone camera</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
