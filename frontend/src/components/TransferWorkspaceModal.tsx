import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  X, 
  Copy, 
  Check, 
  QrCode, 
  Clock, 
  RefreshCw
} from 'lucide-react';
import { createWorkspaceTransfer } from '../session';

interface TransferWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export const TransferWorkspaceModal: React.FC<TransferWorkspaceModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
}) => {
  const [loading, setLoading] = useState(false);
  const [transferUrl, setTransferUrl] = useState<string>('');
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [, setExpiresAt] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(600); // 10 minutes in seconds
  const [error, setError] = useState<string | null>(null);

  const generateTransfer = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const result = await createWorkspaceTransfer();
      setTransferUrl(result.transferUrl);
      setExpiresAt(result.expiresAt);
      setTimeLeft(600);

      const qr = await QRCode.toDataURL(result.transferUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: '#07100e',
          light: '#eaf3ef',
        },
      });
      setQrCodeData(qr);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate transfer token');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      generateTransfer();
    }
  }, [isOpen]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || !transferUrl) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, transferUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!transferUrl) return;
    navigator.clipboard.writeText(transferUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="luxe-card w-full max-w-md p-6 sm:p-8 relative shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-[12px] text-[var(--mut)] hover:text-white hover:bg-[var(--bg)] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-[16px] bg-gradient-to-tr from-[var(--em)] to-[#0f7f5d] flex items-center justify-center text-[#04130e] shadow-lg shadow-[#34d6a022]">
            <QrCode className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-white text-[24px]">Transfer Workspace</h2>
            <p className="text-xs text-[var(--mut)]">Continue this workspace on mobile or another browser</p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-[var(--bg)] border border-[var(--line)] rounded-[20px] p-4 mb-5 text-xs text-[var(--tx)] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[var(--mut)]">Workspace ID:</span>
            <span className="font-mono text-[var(--em)] font-semibold">{workspaceId.slice(0, 12)}…</span>
          </div>
          <p className="text-[12px] text-[var(--mut)] leading-relaxed pt-1">
            Zero accounts or passwords needed. Scan the QR code or open the single-use link on another device to securely import all your saved short URLs.
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-[var(--em)] animate-spin" />
            <p className="text-xs text-[var(--mut)] font-mono">Generating high-entropy one-time token…</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="py-6 space-y-4 text-center">
            <div className="p-3 bg-[#f0b44c18] border border-[#f0b44c44] rounded-[16px] text-[var(--amber)] text-xs">
              {error}
            </div>
            <button
              onClick={generateTransfer}
              className="luxe-btn py-2 px-5 text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        {/* QR Code & Link Content */}
        {!loading && !error && transferUrl && (
          <div className="space-y-4">
            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-4 bg-[var(--bg)] border border-[var(--line)] rounded-[20px] mx-auto w-fit shadow-inner">
              {qrCodeData && (
                <img
                  src={qrCodeData}
                  alt="Workspace Transfer QR Code"
                  className="w-48 h-48 rounded-[12px]"
                />
              )}
            </div>

            {/* Expiration Timer & Notice */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-[16px] bg-[var(--bg)] border border-[var(--line)] text-xs">
              <div className="flex items-center gap-1.5 text-[var(--amber)] font-medium">
                <Clock className="w-3.5 h-3.5" />
                <span>Single-use token</span>
              </div>
              <div className="font-mono text-[var(--tx)] font-semibold">
                Expires in: <span className="text-[var(--em)]">{formattedTime}</span>
              </div>
            </div>

            {/* Copyable Link Field */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[var(--mut)] uppercase tracking-wider font-mono">
                Private Transfer Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={transferUrl}
                  className="flex-1 bg-[var(--bg)] border border-[var(--line)] rounded-[16px] px-3.5 py-2.5 text-xs font-mono text-[var(--tx)] truncate outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="luxe-btn py-2.5 px-4 text-xs font-bold shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[var(--em)]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={generateTransfer}
                className="text-xs text-[var(--mut)] hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Generate new token</span>
              </button>
              <button
                onClick={onClose}
                className="luxe-btn py-2 px-5 text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
