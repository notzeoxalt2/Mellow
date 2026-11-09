import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Frameless desktop controls float over the app instead of occupying a title strip. */
export function AppTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.isDesktop || !window.electronAPI.isMaximized) return;
    void window.electronAPI.isMaximized().then(setIsMaximized);
    return window.electronAPI.onMaximizeChange?.(setIsMaximized);
  }, []);

  if (typeof window === 'undefined' || !window.electronAPI?.isDesktop) return null;

  return (
    <header className="mellow-window-chrome" aria-label="Window controls">
      <div className="mellow-window-drag" aria-hidden="true" />
      <div className="mellow-window-controls" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button type="button" onClick={() => window.electronAPI?.minimize()} className="mellow-window-control" title="Minimize" aria-label="Minimize">
          <Minus size={13} />
        </button>
        <button type="button" onClick={() => window.electronAPI?.maximize()} className="mellow-window-control" title={isMaximized ? 'Restore' : 'Maximize'} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
          {isMaximized ? <Copy size={11} className="rotate-180" /> : <Square size={11} />}
        </button>
        <button type="button" onClick={() => window.electronAPI?.close()} className="mellow-window-control mellow-window-close" title="Close" aria-label="Close">
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
