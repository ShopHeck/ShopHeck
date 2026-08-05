import { Flame, Target, Zap, Activity, Clock, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SESSION_COLORS } from './designTokens';
import type { SessionType } from '../types';

export { SESSION_COLORS };

/**
 * Session type → icon.
 *
 * Paired with SESSION_COLORS so the two cannot drift. Before this, Dashboard,
 * WeeklyPlanner and the training log each carried their own mapping — a
 * five-way ternary in one, a config record in another — and they had already
 * diverged on which icon meant "strength".
 *
 * Typed as a total Record, so adding a session type is a compile error here
 * rather than a silently missing icon on three screens.
 */
export const SESSION_ICONS: Record<SessionType, LucideIcon> = {
  conditioning: Flame,
  skill: Target,
  sparring: Zap,
  strength: Activity,
  recovery: Clock,
  rest: Star,
};

export const SESSION_LABELS: Record<SessionType, string> = {
  conditioning: 'Conditioning',
  skill: 'Skill',
  sparring: 'Sparring',
  strength: 'Strength',
  recovery: 'Recovery',
  rest: 'Rest',
};
