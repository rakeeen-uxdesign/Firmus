import React from 'react';
import { Wordmark } from '@/ui/Wordmark';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

const RELOAD_GUARD_KEY = 'rakeeen_last_crash_reload';

/**
 * Catches any render/runtime error in the tree so a transient failure (e.g. a wedged
 * Firestore client) shows a recoverable screen instead of a blank page. Auto-reloads
 * once if the last auto-reload was more than 20s ago — otherwise it just offers the
 * button, so a persistent crash can't become a reload loop.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[ErrorBoundary]', error, info);

    let lastReload = 0;
    try {
      lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    } catch {
      /* ignore */
    }

    if (Date.now() - lastReload > 20_000) {
      try {
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      setTimeout(() => window.location.reload(), 400);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-6 px-6 text-center">
        <Wordmark className="text-sepia font-black text-2xl" />
        <p className="font-mono-main text-xs uppercase tracking-[0.25em] text-ink/50 max-w-xs">
          Something glitched. Reloading…
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn-brutalist px-6 py-3 text-xs font-mono-main uppercase tracking-widest cursor-pointer"
        >
          Reload now
        </button>
      </div>
    );
  }
}
