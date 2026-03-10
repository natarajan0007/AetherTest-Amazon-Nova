"use client";
import { useState } from "react";
import { X, Eye, EyeOff, KeyRound } from "lucide-react";
import { useTestSession } from "@/hooks/useTestSession";

interface Props {
  onClose: () => void;
  onSaved: (name: string) => void;
}

export function CredentialModal({ onClose, onSaved }: Props) {
  const [name,     setName]     = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const { saveCredential } = useTestSession();

  const handleSave = async () => {
    if (!name || !username || !password) { setError("All fields are required."); return; }
    setSaving(true); setError("");
    try {
      await saveCredential(name, username, password);
      onSaved(name); onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-border rounded-xl w-full max-w-sm shadow-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-charcoal">Store Credentials</h2>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-charcoal transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {[
            { label: "Credential Name", value: name,     set: setName,     ph: "e.g. admin, test-user", type: "text"     },
            { label: "Username",        value: username,  set: setUsername,  ph: "username",              type: "text"     },
          ].map(({ label, value, set, ph, type }) => (
            <div key={label}>
              <label className="block text-xs text-text-secondary mb-1">{label}</label>
              <input
                type={type}
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={ph}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-slate-600 focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>
          ))}

          <div>
            <label className="block text-xs text-text-secondary mb-1">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-9 text-sm text-text-primary placeholder:text-slate-600 focus:outline-none focus:border-accent/60 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2.5 top-2.5 text-text-secondary hover:text-charcoal transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-error">{error}</p>}
          <p className="text-[10px] text-text-secondary">
            Credentials are encrypted with Fernet symmetric encryption before storage.
          </p>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-text-secondary hover:text-charcoal hover:border-border/80 hover:bg-surface-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-sm text-white font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
