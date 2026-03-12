import { useState, useEffect } from 'react';
import { getRandomPrompt } from '../utils/reactionPrompts';
import type { Sport } from '../types';

interface Props {
  sport?: Sport;
  active: boolean;
  isPro: boolean;
}

export default function ReactionPrompt({ sport, active, isPro }: Props) {
  const [prompt, setPrompt] = useState(() => getRandomPrompt(sport, isPro));

  useEffect(() => {
    if (!active) return;
    // New prompt every 4 seconds during rest
    const id = setInterval(() => {
      setPrompt(getRandomPrompt(sport, isPro));
    }, 4000);
    return () => clearInterval(id);
  }, [active, sport, isPro]);

  return (
    <div className="flex flex-col items-center justify-center">
      <p className="text-[10px] font-semibold tracking-[0.15em] text-brand-500/70 uppercase mb-1">Next</p>
      <p className="text-lg font-black tracking-widest text-brand-400 text-center leading-tight animate-pulse">
        {prompt}
      </p>
    </div>
  );
}
