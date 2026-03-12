import type { Sport } from '../types';

export const REACTION_PROMPTS: Record<Sport | 'general', string[]> = {
  Boxing:     ['JAB CROSS', 'DOUBLE JAB', 'JAB CROSS HOOK', 'SLIP RIGHT', 'ROLL LEFT', 'BODY SHOT', 'UPPERCUT', 'PIVOT', 'JAB BODY', 'CROSS HOOK'],
  MMA:        ['TAKEDOWN', 'SPRAWL', 'CLINCH', 'JAB CROSS KICK', 'BODY LOCK', 'SHOOT', 'UNDERHOOK', 'TRIP', 'GUARD'],
  'Muay Thai':['TEEP', 'ROUNDHOUSE', 'ELBOW', 'KNEE', 'CLINCH KNEE', 'PUSH KICK', 'SWITCH KICK', 'SWEEP', 'BODY KICK'],
  Kickboxing: ['FRONT KICK', 'ROUNDHOUSE', 'JAB CROSS', 'SPINNING BACK KICK', 'BODY KICK', 'HEAD KICK', 'SIDE KICK'],
  Wrestling:  ['SINGLE LEG', 'DOUBLE LEG', 'SPRAWL', 'SNAP DOWN', 'WHIZZER', 'UNDERHOOK', 'HEADLOCK'],
  BJJ:        ['GUARD PASS', 'SWEEP', 'ARMBAR', 'TRIANGLE', 'REAR NAKED CHOKE', 'TAKEDOWN', 'GUARD'],
  general:    ['MOVE', 'DEFEND', 'COUNTER', 'BODY SHOT', 'HEAD MOVEMENT', 'RESET', 'PRESSURE', 'ATTACK', 'FEINT'],
};

export function getRandomPrompt(sport: Sport | undefined, isPro: boolean): string {
  const key = (isPro && sport && sport in REACTION_PROMPTS) ? sport : 'general';
  const prompts = REACTION_PROMPTS[key as keyof typeof REACTION_PROMPTS];
  return prompts[Math.floor(Math.random() * prompts.length)];
}
