import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { Home } from '@/features/home/Home';
import { Water } from '@/features/water/Water';
import { Pomodoro } from '@/features/focus/Pomodoro';
import { Finance } from '@/features/finance/Finance';
import { Login } from '@/features/auth/Login';
import { TouchIDGate } from '@/features/auth/TouchIDGate';
import { CustomCursor } from '@/ui/CustomCursor';
import { TooltipLayer } from '@/ui/TooltipLayer';
import { FloatingTimer } from '@/features/focus/FloatingTimer';
import { AuthProvider, useAuth } from '@/features/auth/useAuth';
import { PomodoroProvider } from '@/data/usePomodoro';
import { DailyResetManager } from '@/app/DailyResetManager';
import { DeviceCodeBanner } from '@/features/auth/DeviceCodeBanner';
import { motion, AnimatePresence } from 'framer-motion';
import '@/styles/global.css';

const AnimatedPage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -15 }}
    transition={{ type: 'spring', stiffness: 350, damping: 28 }}
    className="w-full"
  >
    {children}
  </motion.div>
);
const AppRoutes: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, biometricCleared, setBiometricCleared } = useAuth();

  const nav = (to: string) => {
    const path = to === 'home' ? '/' : `/${to}`;
    navigate(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Derive current page from location
  const currentPage = location.pathname.replace('/Rakeeen-Home', '').replace('/', '') || 'home';

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-sepia font-black tracking-[0.5em] animate-pulse">RAKEEEN</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        <CustomCursor />
        <Login />
      </div>
    );
  }

  if (!biometricCleared) {
    return (
      <div className="min-h-screen">
        <CustomCursor />
        <TouchIDGate user={user} onCleared={() => setBiometricCleared(true)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <CustomCursor />
      <DailyResetManager />

      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<AnimatedPage><Home navigate={nav} /></AnimatedPage>} />
          <Route path="/water" element={<AnimatedPage><Water navigate={nav} /></AnimatedPage>} />
          <Route path="/pomodoro" element={<AnimatedPage><Pomodoro navigate={nav} /></AnimatedPage>} />
          <Route path="/finance" element={<AnimatedPage><Finance navigate={nav} /></AnimatedPage>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>

      <FloatingTimer currentPage={currentPage} onNavigate={() => nav('pomodoro')} />
      <DeviceCodeBanner user={user} />
    </div>
  );
};

const App: React.FC = () => {
  // Toggles `.is-scrolling` on <html> while any scrollable element (window or a nested
  // overflow container) is actively being scrolled, then removes it after a short idle
  // pause — the scrollbar thumb CSS shows/hides based on this class.
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      document.documentElement.classList.add('is-scrolling');
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        document.documentElement.classList.remove('is-scrolling');
      }, 700);
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, []);

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TooltipLayer />
      <AuthProvider>
        <PomodoroProvider>
          <AppRoutes />
        </PomodoroProvider>
      </AuthProvider>
    </HashRouter>
  );
};

export default App;
