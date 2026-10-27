import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '@/data/firebase';
import { isDarkTheme, setTheme } from '@/lib/theme';
import { IconLock, IconLogin, IconSun as Sun, IconMoon as Moon } from '@/ui/icons';

export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDark, setIsDark] = useState(isDarkTheme);

  const toggleTheme = () => {
    setTheme(!isDark);
    setIsDark(!isDark);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const whitelistedEmail = 'hamed.rakeeen@gmail.com';
      const userEmail = user.email?.toLowerCase();

      if (userEmail !== whitelistedEmail) {
        await auth.signOut();
        setError(`Unauthorized access: ${user.email} is not in the whitelist.`);
      }
    } catch (err) {
      console.error(err);
      setError('Login failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden transition-colors duration-300" style={{ background: 'var(--paper)' }}>
      {/* Theme toggle */}
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
        <div className="flex justify-center mb-8">
          <div className="w-14 h-14 bg-sepia/20 flex items-center justify-center border border-ink text-ink" style={{ borderRadius: 0 }}>
            <IconLock size={28} />
          </div>
        </div>
        
        <div className="mb-10">
          <h1 className="text-3xl font-black uppercase tracking-tight">Vault gatekeeper</h1>
        </div>

        {error && (
          <div className="bg-rust/10 border-2 border-rust text-rust text-[11px] font-black px-4 py-3 mb-8" style={{ borderRadius: 0 }}>
             {error}
          </div>
        )}

        <button 
          onClick={handleGoogleLogin} 
          disabled={loading}
          className="btn-brutalist w-full flex items-center justify-center gap-3 py-4 text-base font-mono-main"
        >
          {loading ? (
             <div className="w-5 h-5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
          ) : (
            <>
              <IconLogin size={20} />
              <span>CONTINUE WITH GOOGLE</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
