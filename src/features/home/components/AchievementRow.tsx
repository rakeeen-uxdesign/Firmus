import React from 'react';
import { motion } from 'framer-motion';
import { WaterVector, FocusVector } from '@/features/home/components/visuals';
import type { Achievement } from '@/domain/greeting';

/** A finished daily goal: one small card-vector per glass / hour, fading in one after another. */
export const AchievementRow: React.FC<{ achievement: Achievement; size?: number }> = ({ achievement, size = 22 }) => (
  <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 align-middle mr-3">
    {Array.from({ length: achievement.count }, (_, i) => (
      <motion.span
        key={i}
        className="inline-flex"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 + i * 0.07, duration: 0.35 }}
      >
        {achievement.kind === 'water'
          ? <WaterVector size={size} fillLevel={1} />
          : <FocusVector size={size} />}
      </motion.span>
    ))}
  </span>
);
