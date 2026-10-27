import React from 'react';
import { useLocation } from 'react-router-dom';
import { usePomodoro } from '@/data/usePomodoro';
import { formatTime } from '@/lib/format';
import { PixelClock } from '@/ui/PixelFocusDisplay';

interface FloatingTimerProps {
  onNavigate: () => void;
  currentPage: string;
}

export const FloatingTimer: React.FC<FloatingTimerProps> = ({ onNavigate }) => {
  const { running, isOvertime, mode, timeLeft, overtime, focusDuration, breakDuration } = usePomodoro();
  const location = useLocation();

  const total = mode === 'focus' ? focusDuration * 60 : breakDuration * 60;
  const elapsedSeconds = isOvertime ? total + overtime : total - timeLeft;

  const isOnPomodoro = location.pathname.includes('pomodoro');
  const displayTime = isOvertime ? `+${formatTime(overtime)}` : formatTime(timeLeft);

  const isOnHome = location.pathname === '/' || location.pathname === '' || location.pathname.endsWith('Rakeeen-Home') || location.pathname.endsWith('Rakeeen-Home/');

  // Don't render if timer not active or already on pomodoro page
  if ((!running && !isOvertime) || isOnPomodoro) return null;

  // If we are on the Home page, we also hide the bottom corner floating widget (as requested: "وتتحط شكل الدايره بتاعة البومدورو [جوة كارت الهوم] وبالتالي تتشال من الجمب من تحت [أثناء وجودنا في الهوم]")
  if (isOnHome) return null;

  return (
    <button
      onClick={onNavigate}
      className="fixed bottom-8 right-8 z-50 flex items-center justify-center transition-transform duration-300 hover:scale-105 hover:-translate-y-1 outline-none group bg-transparent rounded-full w-[170px] h-[170px] cursor-pointer shadow-none border-none"
      data-tip="Return to Pomodoro"
      aria-label="Return to Pomodoro"
    >
      <div className="relative w-full h-full flex flex-col items-center justify-center gap-3">
        <PixelClock
          elapsedSeconds={elapsedSeconds}
          mode={mode}
          running={running}
          isOvertime={isOvertime}
          width="104px"
        />
        <span className="text-[11px] font-black transition-colors duration-500 tabular-nums leading-none text-ink">
          {displayTime}
        </span>
      </div>
    </button>
  );
};
