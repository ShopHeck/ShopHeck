import type { BeltTier } from '../../types';
import { BELT_LABELS } from '../../utils/gamification';

interface Props {
  tier: BeltTier;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const BELT_CLASSES: Record<BeltTier, string> = {
  white:  'bg-gradient-to-r from-gray-200 to-white',
  blue:   'bg-gradient-to-r from-blue-700 to-blue-500',
  purple: 'bg-gradient-to-r from-purple-700 to-purple-500',
  brown:  'bg-gradient-to-r from-amber-900 to-amber-700',
  black:  'bg-gradient-to-r from-gray-900 to-black',
};

const TIP_CLASSES: Record<BeltTier, string> = {
  white:  'bg-black',
  blue:   'bg-white',
  purple: 'bg-white',
  brown:  'bg-black',
  black:  'bg-red-600',
};

const TEXT_CLASSES: Record<BeltTier, string> = {
  white:  'text-gray-200',
  blue:   'text-blue-300',
  purple: 'text-purple-300',
  brown:  'text-amber-300',
  black:  'text-gray-100',
};

const SIZE_CLASSES = {
  sm: { wrap: 'w-14 h-3', tip: 'w-2', label: 'text-[10px]' },
  md: { wrap: 'w-20 h-4', tip: 'w-3', label: 'text-xs' },
  lg: { wrap: 'w-32 h-6', tip: 'w-4', label: 'text-sm' },
};

export default function BeltBadge({ tier, size = 'md', showLabel = false }: Props) {
  const cls = SIZE_CLASSES[size];
  return (
    <div className="inline-flex items-center gap-2">
      <div className={`relative rounded-sm overflow-hidden border border-black/40 ${BELT_CLASSES[tier]} ${cls.wrap}`}>
        <div className={`absolute right-0 top-0 bottom-0 ${TIP_CLASSES[tier]} ${cls.tip}`} />
      </div>
      {showLabel && (
        <span className={`font-bold ${TEXT_CLASSES[tier]} ${cls.label}`}>
          {BELT_LABELS[tier]}
        </span>
      )}
    </div>
  );
}
