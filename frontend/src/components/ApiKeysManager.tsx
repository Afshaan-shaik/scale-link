import React, { useState } from 'react';
import { 
  Key, 
  Plus, 
  Copy, 
  Check, 
  Trash2, 
  AlertTriangle
} from 'lucide-react';
import { APIKey } from '../api';

export const ApiKeysManager: React.FC = () => {
  const [keys, setKeys] = useState<APIKey[]>([
    {
      id: "k-1",
      name: "Production Worker Service",
      key_prefix: "sk_live_9a8f...",
      created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      last_used: new Date().toISOString(),
    },
    {
      id: "k-2",
      name: "CLI Automation Tool",
      key_prefix: "sk_live_3c4d...",
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
  ]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    const rawSecret = 'sk_live_' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    const newKey: APIKey = {
      id: 'k-' + (keys.length + 1),
      name: keyName.trim(),
      key_prefix: rawSecret.substring(0, 12) + '...',
      created_at: new Date().toISOString(),
    };

    setKeys([newKey, ...keys]);
    setGeneratedKey(rawSecret);
    setKeyName('');
  };

  const handleCopySecret = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleRevoke = (id: string) => {
    setKeys(keys.map((k) => (k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k)));
  };

  return (
    <div className="w-full space-y-8 animate-fadeIn">
      {/* Top Bar Hero */}
      <div className="luxe-hero flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[16px] bg-[#6cc8f018] border border-[#6cc8f033] flex items-center justify-center shrink-0">
            <Key className="w-6 h-6 text-[var(--sky)]" />
          </div>
          <div>
            <h2 className="text-white text-[28px] sm:text-[32px]">API Key Management</h2>
            <p className="text-[var(--mut)] text-xs sm:text-sm">
              Programmatic link creation authenticated via SHA-256 key hashing
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setGeneratedKey(null);
            setShowCreateModal(true);
          }}
          className="luxe-go py-3 px-6 text-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          <span>Create New API Key</span>
        </button>
      </div>

      {/* Generated Key Alert */}
      {generatedKey && (
        <div className="p-6 rounded-[24px] bg-[#f0b44c14] border-2 border-[#f0b44c55] text-[var(--amber)] animate-fadeIn">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-[var(--amber)] shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-base font-bold text-white">Save Your API Key Now</h3>
              <p className="text-xs text-[var(--mut)] mt-1">
                We only store a SHA-256 cryptographic hash of this key. For security, you will never be able to view this secret token again.
              </p>

              <div className="mt-4 flex items-center justify-between gap-3 p-3.5 bg-[var(--bg)] border border-[var(--line)] rounded-[16px] font-mono text-xs text-[var(--em)] select-all">
                <span className="truncate">{generatedKey}</span>
                <button
                  onClick={handleCopySecret}
                  className="luxe-btn py-1.5 px-4 text-xs font-bold text-[var(--em)] border-[#34d6a044]"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key List Rows: 20px x 26px padding, 16px gaps */}
      <div className="grid gap-[16px]">
        {keys.map((k) => (
          <div key={k.id} className="luxe-row items-center">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-base text-white">{k.name}</span>
                {k.revoked_at ? (
                  <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-[8px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                    Revoked
                  </span>
                ) : (
                  <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-[8px] bg-[#34d6a018] text-[var(--em)] border border-[#34d6a033] font-medium">
                    Active
                  </span>
                )}
              </div>
              <div className="font-mono text-xs text-[var(--mut)]">{k.key_prefix}</div>
              <div className="flex items-center gap-3 text-[12px] text-[var(--mut)] font-mono">
                <span>Created {new Date(k.created_at).toLocaleDateString()}</span>
                {k.last_used && <span>• Last used recently</span>}
              </div>
            </div>

            {!k.revoked_at && (
              <button
                onClick={() => handleRevoke(k.id)}
                className="luxe-btn py-2 px-4 text-xs text-rose-400 border-rose-500/20 hover:border-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Revoke Key</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Create Key Modal */}
      {showCreateModal && !generatedKey && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="luxe-card p-7 sm:p-9 max-w-md w-full shadow-2xl animate-fadeIn">
            <h2 className="text-white text-[24px] mb-1">Create API Key</h2>
            <p className="text-xs text-[var(--mut)] mb-6">Provide a recognizable label for this programmatic credential.</p>

            <form onSubmit={handleGenerate} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-[var(--tx)] mb-2 font-mono">Key Description / Name</label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g. Production Microservice / Zapier Webhook"
                  className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--line)] rounded-[16px] text-xs text-white placeholder-[var(--mut)] outline-none focus:border-[var(--em)]"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="luxe-btn py-2.5 px-5 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!keyName.trim()}
                  className="luxe-go py-2.5 px-6 text-xs font-bold disabled:opacity-50"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
