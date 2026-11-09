import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Mounts off-screen shelf contents only as the reader approaches them. */
export function DeferredMount({ children, placeholder }: { children: ReactNode; placeholder: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const element = host.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setReady(true);
      return;
    }

    const root = document.getElementById('scrollable-page');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setReady(true);
        observer.disconnect();
      },
      { root, rootMargin: '500px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);

  return <div ref={host}>{ready ? children : placeholder}</div>;
}
