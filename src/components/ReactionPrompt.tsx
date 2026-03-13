import { useState, useEffect, useRef } from 'react';
import { getRandomPrompt } from '../utils/reactionPrompts';
import type { Sport } from '../types';

interface Props {
  sport?: Sport;
  active: boolean;
  isPro: boolean;
}

export default function ReactionPrompt({ sport, active, isPro }: Props) {
  const [prompt, setPrompt] = useState(() => getRandomPrompt(sport, isPro));
  const [fade, setFade] = useState(true);
  const prevRef = useRef(prompt);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      let next = getRandomPrompt(sport, isPro);
      // avoid repeating the same sentence back-to-back
      if (next === prevRef.current) next = getRandomPrompt(sport, isPro);
      prevRef.current = next;
      setFade(false);
      setTimeout(() => { setPrompt(next); setFade(true); }, 300);
    }, 5000);
    return () => clearInterval(id);
  }, [active, sport, isPro]);

  return (
    <div
      className="px-4 text-center transition-opacity duration-300"
      style={{ opacity: fade ? 1 : 0 }}
    >
      <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-1">Coach says</p>
      <p className="text-sm font-semibold text-gray-200 leading-snug">{prompt}</p>
    </div>
  );
}
