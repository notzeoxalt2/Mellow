import { Check, Copy, RefreshCw, Smartphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface LinkMobileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LinkMobileModal({ isOpen, onClose }: LinkMobileModalProps) {
  const [code, setCode] = useState<string>('');
  const [lanIps, setLanIps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paired, setPaired] = useState(false);

  const fetchCode = async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.getPairingCode) {
      setLoading(true);
      try {
        const res = await window.electronAPI.getPairingCode();
        setCode(res.code);
        setLanIps(res.lanIps);
      } catch (err) {
        console.error('Failed to get pairing code:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      setPaired(false);
      void fetchCode();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = window.electronAPI?.onPhonePaired?.((data) => {
      if (data.code === code) {
        setPaired(true);
        setTimeout(() => {
          onClose();
        }, 2200);
      }
    });
    return () => unsub?.();
  }, [isOpen, code, onClose]);

  if (!isOpen) return null;

  const formattedCode = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

  const handleCopy = () => {
    if (!code) return;
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-[16px] bg-[#14161f] border border-white/10 p-6 shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-full text-secondary hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="grid size-10 place-items-center rounded-[10px] bg-(--theme-accent)/20 text-(--theme-accent) border border-(--theme-accent)/30">
            <Smartphone size={22} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Link Mellow Android App</h2>
            <p className="text-xs text-secondary">Instant account sync with zero typing</p>
          </div>
        </div>

        {paired ? (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3 animate-fade-in">
            <div className="grid size-14 place-items-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Check size={32} />
            </div>
            <h3 className="text-base font-semibold text-white">Phone Connected!</h3>
            <p className="text-xs text-secondary">Your YouTube Music & Spotify accounts are now synced on mobile.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col items-center justify-center gap-2 py-5 px-4 rounded-[12px] bg-black/40 border border-white/[0.08]">
              <span className="text-xs font-medium text-white/50 tracking-wider uppercase">Your 6-Digit Sync Code</span>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-mono font-bold tracking-[0.25em] text-white">
                  {loading ? '••••••' : formattedCode || '------'}
                </span>
                <button
                  type="button"
                  onClick={fetchCode}
                  disabled={loading}
                  className="grid size-8 place-items-center rounded-full text-secondary hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
                  title="Generate new code"
                >
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!code || loading}
                className="flex items-center gap-1.5 mt-1 text-xs text-secondary hover:text-white transition-colors cursor-pointer"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copied ? 'Code Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            <div className="flex flex-col gap-2.5 text-xs text-secondary">
              <div className="flex items-start gap-2.5">
                <span className="flex size-5 flex-none items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">1</span>
                <span>Open <b>Mellow</b> on your Android phone (connected to the same Wi-Fi).</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex size-5 flex-none items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">2</span>
                <span>Tap <b>Link with PC</b> on the Welcome screen or in Settings.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex size-5 flex-none items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">3</span>
                <span>Enter this 6-digit code. Both YouTube Music and Spotify will sync automatically!</span>
              </div>
            </div>

            {lanIps.length > 0 && (
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-tertiary">
                <span>Local IP: {lanIps[0]}</span>
                <span>Port: 41838</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
