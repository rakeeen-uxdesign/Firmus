import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { signOut } from 'firebase/auth';
import { auth } from '@/data/firebase';
import {
  getStoredCredentialIds,
  registerTouchID,
  verifyTouchID,
  isBiometricSupported,
} from '@/data/webauthn';
import { requestDeviceCode, verifyDeviceCode } from '@/data/deviceAuth';
import { ICON_STROKE_WIDTH, ICON_STROKE_LINECAP, IconSun as Sun, IconMoon as Moon } from '@/ui/icons';

interface Props {
  user: User;
  onCleared: () => void;
}

type Stage = 'checking' | 'register' | 'verify' | 'get_code' | 'enter_code' | 'error';

const FingerprintVector: React.FC<{ scanning?: boolean }> = ({ scanning = false }) => {
  const cx = 30;
  const cy = 38;
  const radii = [5, 10, 15, 20, 25];
  return (
    <svg width="56" height="56" viewBox="0 0 60 56" fill="none">
      <style>{`
        @keyframes fpDraw {
          0%   { stroke-dashoffset: var(--len); opacity: 0.15; }
          35%  { stroke-dashoffset: 0;          opacity: 1; }
          70%  { stroke-dashoffset: 0;          opacity: 1; }
          100% { stroke-dashoffset: var(--len); opacity: 0.15; }
        }
        @keyframes fpDot {
          0%, 100% { opacity: 0.2; transform: scale(0.6); }
          35%, 70% { opacity: 1;   transform: scale(1); }
        }
      `}</style>

      {/* Center dot */}
      <circle
        cx={cx} cy={cy} r={2}
        fill="currentColor"
        style={{
          animation: scanning ? 'fpDot 2.8s ease-in-out infinite' : undefined,
          transformOrigin: `${cx}px ${cy}px`,
          opacity: scanning ? undefined : 0.5,
        }}
      />

      {/* Concentric arcs */}
      {radii.map((r, i) => {
        const len = Math.PI * r;
        const delay = i * 0.18;
        return (
          <path
            key={r}
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            stroke="currentColor"
            strokeWidth={ICON_STROKE_WIDTH}
            strokeLinecap={ICON_STROKE_LINECAP}
            fill="none"
            style={{
              ['--len' as string]: len,
              strokeDasharray: `${len} ${len}`,
              strokeDashoffset: scanning ? len : 0,
              opacity: scanning ? 0.15 : 0.5 - i * 0.06,
              animation: scanning
                ? `fpDraw 2.8s ease-in-out ${delay}s infinite`
                : undefined,
            }}
          />
        );
      })}
    </svg>
  );
};

export const TouchIDGate: React.FC<Props> = ({ user, onCleared }) => {
  const [stage, setStage] = useState<Stage>('checking');
  const [credentialIds, setCredentialIds] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [isDark, setIsDark] = useState(() => document.body.classList.contains('dark-theme'));

  const toggleTheme = () => {
    const next = !isDark;
    document.body.classList.toggle('dark-theme', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDark(next);
  };

  useEffect(() => {
    async function init() {
      if (!isBiometricSupported()) {
        setErrorMsg('This browser does not support Touch ID.');
        setStage('error');
        return;
      }
      try {
        const ids = await getStoredCredentialIds(user.uid);
        setCredentialIds(ids);
        setStage(ids.length === 0 ? 'register' : 'verify');
      } catch {
        setErrorMsg('Failed to connect. Check your connection.');
        setStage('error');
      }
    }
    init();
  }, [user.uid]);

  const handleRegister = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      await registerTouchID(user.uid, user.email ?? user.uid);
      onCleared();
    } catch (e) {
      setErrorMsg(
        (e as { name?: string })?.name === 'NotAllowedError'
          ? 'Cancelled. Try again.'
          : 'Registration failed. Make sure Touch ID is enabled.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      const result = await verifyTouchID(credentialIds);
      if (result === 'ok') {
        onCleared();
      } else if (result === 'not_registered') {
        // No credential for this domain — switch to register mode
        setCredentialIds([]);
        setStage('register');
      } else {
        setErrorMsg('Wrong fingerprint. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGetCode = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      await requestDeviceCode(user.uid);
      setStage('enter_code');
    } catch {
      setErrorMsg('Failed to request code. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!codeInput.trim()) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const valid = await verifyDeviceCode(user.uid, codeInput);
      if (valid) {
        setStage('register');
        setCodeInput('');
      } else {
        setErrorMsg('Wrong or expired code. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden transition-colors duration-300" style={{ background: 'var(--paper)' }}>

      <button
        onClick={toggleTheme}
        className="absolute top-5 right-5 z-20 cursor-pointer"
        data-tip={isDark ? 'Switch to light' : 'Switch to dark'}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {isDark ? (
          <Sun size={18} className="text-ink/40 hover:text-ink transition-colors" />
        ) : (
          <Moon size={18} className="text-ink/40 hover:text-ink transition-colors" />
        )}
      </button>

      <div className="w-full max-w-md brutalist-card no-lift p-10 md:p-12 relative z-10 text-center">

        {/* Animated fingerprint icon */}
        <div className="flex justify-center mb-8">
          <div
            className="w-14 h-14 bg-sepia/20 flex items-center justify-center border border-ink text-ink"
            style={{ borderRadius: 0 }}
          >
            <FingerprintVector scanning={stage === 'verify' || stage === 'register' || busy} />
          </div>
        </div>

        {/* Title */}
        <div className="mb-10">
          <h1 className="text-3xl font-black uppercase tracking-tight">
            {stage === 'checking'   && 'CHECKING…'}
            {stage === 'register'   && 'REGISTER TOUCH ID'}
            {stage === 'verify'     && 'TOUCH ID REQUIRED'}
            {stage === 'get_code'   && 'GET ACCESS CODE'}
            {stage === 'enter_code' && 'ENTER CODE'}
            {stage === 'error'      && 'ACCESS DENIED'}
          </h1>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="bg-rust/10 border-2 border-rust text-rust text-[11px] font-black px-4 py-3 mb-8" style={{ borderRadius: 0 }}>
            {errorMsg}
          </div>
        )}

        {/* CTA */}
        {stage === 'checking' && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-2 border-ink/20 border-t-ink rounded-full animate-spin" />
          </div>
        )}

        {(stage === 'register' || stage === 'verify') && (
          <button
            onClick={stage === 'register' ? handleRegister : handleVerify}
            disabled={busy}
            className="btn-brutalist w-full flex items-center justify-center gap-3 py-4 text-base font-mono-main cursor-pointer"
          >
            {busy
              ? <div className="w-5 h-5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
              : stage === 'register' ? 'REGISTER ON THIS DEVICE' : 'AUTHENTICATE'
            }
          </button>
        )}

        {stage === 'verify' && !busy && (
          <button
            onClick={() => { setStage('get_code'); setErrorMsg(''); }}
            className="mt-4 font-mono-main text-[10px] uppercase tracking-widest text-ink/25 hover:text-ink/50 transition-colors cursor-pointer"
          >
            No passkey on this device? Get a code
          </button>
        )}

        {stage === 'get_code' && (
          <>
            <p className="text-[11px] font-mono-main text-ink/50 mb-6 leading-relaxed">
              Open your trusted device (Mac), then click the button below. A 6-digit code will appear there.
            </p>
            <button
              onClick={handleGetCode}
              disabled={busy}
              className="btn-brutalist w-full flex items-center justify-center gap-3 py-4 text-base font-mono-main cursor-pointer"
            >
              {busy
                ? <div className="w-5 h-5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                : 'SEND CODE TO MY MAC'
              }
            </button>
          </>
        )}

        {stage === 'enter_code' && (
          <>
            <p className="text-[11px] font-mono-main text-ink/50 mb-4 leading-relaxed">
              Enter the 6-digit code shown on your Mac.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={codeInput}
              onChange={e => setCodeInput(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full border border-ink bg-transparent text-center text-3xl font-black font-mono-main tracking-[0.3em] py-3 mb-4 outline-none"
              style={{ borderRadius: 0 }}
            />
            <button
              onClick={handleVerifyCode}
              disabled={busy || codeInput.length < 6}
              className="btn-brutalist w-full flex items-center justify-center gap-3 py-4 text-base font-mono-main cursor-pointer"
            >
              {busy
                ? <div className="w-5 h-5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                : 'VERIFY CODE'
              }
            </button>
          </>
        )}

        {stage !== 'checking' && (
          <button
            onClick={handleLogout}
            className="mt-6 font-mono-main text-[10px] uppercase tracking-widest text-ink/25 hover:text-ink/50 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
};
