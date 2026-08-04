import { useEffect, useState } from 'react';
import { Share2, X } from 'lucide-react';
import { AchievementIcon } from './achievementIcons';
import { useApp } from '../../context/AppContext';
import { triggerHaptic, HAPTIC } from '../../hooks/useHaptics';
import ShareCard, { type MilestoneShare } from '../ShareCard';
import { maybeRequestReview } from '../../utils/appReview';
import type { CelebrationEvent } from '../../types';

const DISMISS_MS = 4000;

// The kinds worth broadcasting — belts, streaks, and PRs are the app's
// combat-sports bragging rights. Achievements/challenges stay toast-only so
// the share offer keeps meaning.
const SHARE_EMOJI: Partial<Record<CelebrationEvent['kind'], string>> = {
  belt: '🥋',
  streak_milestone: '🔥',
  pr: '📈',
};

function toMilestone(event: CelebrationEvent): MilestoneShare {
  return {
    // "Blue Belt unlocked!" → "BLUE BELT UNLOCKED" — the canvas headline
    // shrinks to fit, so long PR titles are fine.
    title: event.title.replace(/!+$/, '').toUpperCase(),
    subtitle: event.subtitle,
    emoji: SHARE_EMOJI[event.kind] ?? '🏆',
    slug: event.id,
  };
}

export default function CelebrationToast() {
  const { state, dispatch } = useApp();
  const queue = state.gamification?.pendingCelebrations ?? [];
  const event = queue[0] ?? null;
  // Snapshot at tap time: the toast dismisses (and the queue advances) while
  // the share sheet is open.
  const [shareMilestone, setShareMilestone] = useState<MilestoneShare | null>(null);

  // Paused while the share sheet is open: the toast renders above the sheet
  // (z-70 vs z-50), so without this the rest of the queue would keep sliding
  // in over the card, firing haptics, auto-advancing unseen — and a second
  // Share tap would silently swap the card mid-share. The queued event resumes
  // (haptic included — it was never shown) when the sheet closes.
  useEffect(() => {
    if (!event || shareMilestone) return;
    triggerHaptic(HAPTIC.sessionComplete);
    const id = setTimeout(() => {
      dispatch({ type: 'DISMISS_CELEBRATION', payload: event.id });
      // A belt promotion is the app's strongest earned moment — ask for a
      // rating as the toast slides away, not over it. Only on the passive
      // auto-dismiss: a user busy tapping Share or X shouldn't get a sheet.
      if (event.kind === 'belt') void maybeRequestReview('belt');
    }, DISMISS_MS);
    return () => clearTimeout(id);
  }, [event?.id, shareMilestone]); // eslint-disable-line react-hooks/exhaustive-deps

  const shareable = !!event && event.kind in SHARE_EMOJI && !!state.currentUser;

  function openShare() {
    if (!event) return;
    setShareMilestone(toMilestone(event));
    dispatch({ type: 'DISMISS_CELEBRATION', payload: event.id });
  }

  if (!event && !shareMilestone) return null;

  return (
    <>
      {event && !shareMilestone && (
        <div className="fixed inset-x-0 top-4 z-[70] flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto max-w-sm w-full bg-gradient-to-br from-brand-700 to-purple-800 border border-brand-500 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 celebration-slide">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <AchievementIcon name={event.icon} size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{event.title}</p>
              <p className="text-xs text-white/80 truncate">{event.subtitle}</p>
            </div>
            {shareable && (
              <button
                onClick={openShare}
                className="flex items-center gap-1 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg px-2.5 py-1.5 transition-colors flex-shrink-0"
                aria-label={`Share: ${event.title}`}
              >
                <Share2 size={13} /> Share
              </button>
            )}
            <button
              onClick={() => dispatch({ type: 'DISMISS_CELEBRATION', payload: event.id })}
              className="text-white/70 hover:text-white transition-colors flex-shrink-0 w-11 h-11 flex items-center justify-center -m-2"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {shareMilestone && state.currentUser && (
        <ShareCard
          content={{ kind: 'milestone', milestone: shareMilestone }}
          user={state.currentUser}
          onClose={() => setShareMilestone(null)}
        />
      )}
    </>
  );
}
