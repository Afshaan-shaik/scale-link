import React, { useState } from 'react';
import { 
  Key, 
  Plus, 
  Copy, 
  Check, 
  Trash2, 
  AlertTriangle, 
  ShieldCheck, 
  Calendar,
  Lock
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 glass-card p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Key className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">API Key Management</h2>
            <p className="text-xs text-slate-400">Programmatic link creation authenticated via SHA-256 key hashing</p>
          </div>
        </div>

        <button
          onClick={() => {
            setGeneratedKey(null);
            setShowCreateModal(true);
          }}
          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center space-x-1.5 shadow-md shadow-emerald-500/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Create New API Key</span>
        </button>
      </div>

      {/* Generated Key Alert Modal */}
      {generatedKey && (
        <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-200 animate-fadeIn">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-white">Save Your API Key Now</h4>
              <p className="text-xs text-amber-200/90 mt-0.5">
                We only store a SHA-256 cryptographic hash of this key. For security, you will never be able to view this secret token again.
              </p>

              <div className="mt-3 flex items-center justify-between gap-2 p-3 bg-slate-950/90 border border-amber-500/30 rounded-xl font-mono text-xs text-emerald-400 select-all">
                <span className="truncate">{generatedKey}</span>
                <button
                  onClick={handleCopySecret}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-all flex items-center space-x-1 shrink-0 active:scale-95"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key List */}
      <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="divide-y divide-slate-800">
          {keys.map((k) => (
            <div key={k.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-sm text-white">{k.name}</span>
                  {k.revoked_at ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                      Revoked
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      Active
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs text-slate-400">{k.key_prefix}</div>
                <div className="flex items-center space-x-3 text-[11px] text-slate-500">
                  <span>Created {new Date(k.created_at).toLocaleDateString()}</span>
                  {k.last_used && <span>• Last used recently</span>}
                </div>
              </div>

              {!k.revoked_at && (
                <button
                  onClick={() => handleRevoke(k.id)}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/20 transition-all flex items-center space-x-1 self-start sm:self-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Revoke Key</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create Key Modal */}
      {showCreateModal && !generatedKey && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-scaleUp">
            <h3 className="text-base font-bold text-white mb-1">Create API Key</h3>
            <p className="text-xs text-slate-400 mb-4">Provide a recognizable label for this programmatic credential.</p>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Key Description / Name</label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g. Production Microservice / Zapier Webhook"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!keyName.trim()}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-all disabled:opacity-50"
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
