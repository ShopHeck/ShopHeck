import {
  Activity,
  Award,
  CheckCircle2,
  Crown,
  Dumbbell,
  Flame,
  Hammer,
  Moon,
  RotateCcw,
  Sunrise,
  Swords,
  TrendingUp,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Achievement and celebration icons are stored as strings (they live in
 * persisted state and achievement definitions), so they need a runtime lookup.
 * The lookup must stay an explicit map: `import * as LucideIcons` defeats
 * tree-shaking and drags the entire icon library (~590 KB minified) into the
 * first-paint bundle. When an achievement definition gains a new icon name,
 * add it here.
 */
const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  Activity,
  Award,
  CheckCircle2,
  Crown,
  Dumbbell,
  Flame,
  Hammer,
  Moon,
  RotateCcw,
  Sunrise,
  Swords,
  TrendingUp,
  Trophy,
  Zap,
};

/** Renders the named achievement icon, falling back to Award for unknown names. */
export function AchievementIcon({ name, size, className }: {
  name?: string;
  size?: number;
  className?: string;
}) {
  const Icon = (name && ACHIEVEMENT_ICONS[name]) || Award;
  return <Icon size={size} className={className} />;
}
