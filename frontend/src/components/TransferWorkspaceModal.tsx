import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  X, 
  Copy, 
  Check, 
  QrCode, 
  Clock, 
  ShieldCheck, 
  AlertCircle, 
  ArrowRight,
  RefreshCw,
  Sparkles
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
  const [expiresAt, setExpiresAt] = useState<string>('');
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
          dark: '#020617',
          light: '#ffffff',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="glass-card w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/20">
            <QrCode className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Transfer Workspace</h3>
            <p className="text-xs text-slate-400">Continue this workspace on mobile or another browser</p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 mb-5 text-xs text-slate-300 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Workspace ID:</span>
            <span className="font-mono text-emerald-400 font-semibold">{workspaceId.slice(0, 12)}...</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
            Zero accounts or passwords needed. Scan the QR code or open the private link on another device to securely import all your saved short URLs.
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-xs text-slate-400 font-mono">Generating high-entropy one-time token...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="py-6 space-y-4 text-center">
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
              {error}
            </div>
            <button
              onClick={generateTransfer}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        {/* QR Code & Link Content */}
        {!loading && !error && transferUrl && (
          <div className="space-y-4">
            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl shadow-inner mx-auto w-fit">
              {qrCodeData && (
                <img
                  src={qrCodeData}
                  alt="Workspace Transfer QR Code"
                  className="w-48 h-48 rounded"
                />
              )}
            </div>

            {/* Expiration Timer & Notice */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs">
              <div className="flex items-center space-x-1.5 text-amber-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Single-use token</span>
              </div>
              <div className="font-mono text-slate-300 font-bold">
                Expires in: <span className="text-emerald-400">{formattedTime}</span>
              </div>
            </div>

            {/* Copyable Link Field */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Private Transfer Link
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={transferUrl}
                  className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 truncate focus:outline-none"
                />
                <button
                  onClick={handleCopy}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0 ${
                    copied
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40'
                  }`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={generateTransfer}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Generate new token</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-all"
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
