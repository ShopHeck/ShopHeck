import { useState } from 'react';
import { Award, CheckCircle2, Flame, Lock, TrendingUp } from 'lucide-react';
import { AchievementIcon } from './achievementIcons';
import { useApp } from '../../context/AppContext';
import {
  ACHIEVEMENTS,
  BELT_LABELS,
  BELT_ORDER,
  BELT_THRESHOLDS,
  PR_LABELS,
  PR_UNITS,
  defaultGamificationState,
} from '../../utils/gamification';
import type { BeltTier, PRType } from '../../types';
import BeltBadge from './BeltBadge';
import { format, parseISO } from 'date-fns';

type Tab = 'belt' | 'achievements' | 'prs' | 'challenges';

export default function ProgressScreen() {
  const { state } = useApp();
  const gam = state.gamification ?? defaultGamificationState();
  const [tab, setTab] = useState<Tab>('belt');

  return (
    <div className="space-y-4 pb-4 px-4 pt-4">
      <div className="flex items-center justify-between gap-3 bg-dark-700 border border-dark-500 rounded-2xl p-4">
        <div className="flex items-center gap-3 min-w-0">
          <BeltBadge tier={gam.belt.current} size="lg" />
          <div className="min-w-0">
            <p className="text-base font-black text-white">{BELT_LABELS[gam.belt.current]}</p>
            <p className="text-xs text-gray-400">
              {gam.belt.workoutCount} workouts · {gam.belt.effectiveWinCredit.toFixed(1)} win credits
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xl font-black text-white">{gam.totalXp}</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">XP</div>
        </div>
      </div>

      <div className="flex gap-1 bg-dark-700 border border-dark-500 rounded-xl p-1">
        {(['belt', 'achievements', 'prs', 'challenges'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-colors ${
              tab === t ? 'bg-brand-700 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t === 'prs' ? 'PRs' : t}
          </button>
        ))}
      </div>

      {tab === 'belt' && <BeltTab achievedAt={gam.belt.achievedAt} current={gam.belt.current} />}
      {tab === 'achievements' && <AchievementsTab unlocked={gam.achievements} />}
      {tab === 'prs' && <PRsTab records={gam.personalRecords} />}
      {tab === 'challenges' && <ChallengesTab challenges={gam.challenges} />}
    </div>
  );
}

function BeltTab({ achievedAt, current }: { achievedAt: Partial<Record<BeltTier, string>>; current: BeltTier }) {
  const currentIdx = BELT_ORDER.indexOf(current);
  return (
    <div className="space-y-2">
      {BELT_ORDER.map((tier, i) => {
        const earned = !!achievedAt[tier];
        const isCurrent = i === currentIdx;
        const thr = BELT_THRESHOLDS[tier];
        return (
          <div
            key={tier}
            className={`card flex items-center gap-3 ${isCurrent ? 'border-brand-600' : earned ? 'border-dark-400' : 'border-dark-600 opacity-60'}`}
          >
            <BeltBadge tier={tier} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{BELT_LABELS[tier]}</p>
              <p className="text-xs text-gray-400">
                {tier === 'white'
                  ? 'Starting rank'
                  : `${thr.workouts} workouts or ${thr.wins} win${thr.wins === 1 ? '' : 's'}`}
              </p>
            </div>
            {earned ? (
              <div className="text-right flex-shrink-0">
                <Award size={14} className="text-brand-400 inline" />
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {achievedAt[tier] ? format(parseISO(achievedAt[tier] as string), 'MMM d, yyyy') : ''}
                </p>
              </div>
            ) : (
              <Lock size={16} className="text-gray-500 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AchievementsTab({ unlocked }: { unlocked: { id: string; unlockedAt: string }[] }) {
  const unlockedMap = new Map(unlocked.map(a => [a.id, a.unlockedAt]));
  return (
    <div className="grid grid-cols-2 gap-3">
      {ACHIEVEMENTS.map(def => {
        const earnedAt = unlockedMap.get(def.id);
        const earned = !!earnedAt;
        return (
          <div
            key={def.id}
            className={`card flex flex-col items-center text-center py-4 ${earned ? '' : 'opacity-50'}`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${earned ? 'bg-brand-900/60' : 'bg-dark-600'}`}>
              {earned ? (
                <AchievementIcon name={def.icon} size={22} className="text-brand-400" />
              ) : (
                <Lock size={18} className="text-gray-500" />
              )}
            </div>
            <p className="text-xs font-bold text-white">{def.name}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{def.description}</p>
            {earned && earnedAt && (
              <p className="text-[9px] text-brand-500 mt-1">{format(parseISO(earnedAt), 'MMM d, yyyy')}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PRsTab({ records }: { records: Partial<Record<PRType, { value: number; achievedAt: string; previousValue: number | null }>> }) {
  const types: PRType[] = ['longest_workout', 'highest_weekly_mep', 'most_workouts_week', 'highest_rpe'];
  return (
    <div className="space-y-2">
      {types.map(type => {
        const r = records[type];
        return (
          <div key={type} className="card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-900/40 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={18} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{PR_LABELS[type]}</p>
              {r ? (
                <p className="text-xs text-gray-400">
                  {format(parseISO(r.achievedAt), 'MMM d, yyyy')}
                  {r.previousValue != null && (
                    <span className="text-gray-500"> · prev {r.previousValue} {PR_UNITS[type]}</span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-gray-400">No record yet</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-lg font-black text-white">{r ? r.value : '—'}</div>
              <div className="text-[10px] text-gray-400">{PR_UNITS[type]}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChallengesTab({ challenges }: { challenges: { id: string; weekKey: string; title: string; target: number; progress: number; completed: boolean; xpReward: number }[] }) {
  // Group by weekKey, newest first.
  const byWeek = new Map<string, typeof challenges>();
  for (const c of challenges) {
    const arr = byWeek.get(c.weekKey) ?? [];
    arr.push(c);
    byWeek.set(c.weekKey, arr);
  }
  const weeks = Array.from(byWeek.keys()).sort().reverse();

  return (
    <div className="space-y-4">
      {weeks.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">Log a workout to start this week's challenges.</p>
      )}
      {weeks.map(wk => (
        <div key={wk}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Week of {format(parseISO(wk), 'MMM d')}
          </p>
          <div className="space-y-2">
            {byWeek.get(wk)!.map(c => {
              const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
              return (
                <div key={c.id} className={`card ${c.completed ? 'border-teal-700' : ''}`}>
                  <div className="flex items-center gap-2">
                    {c.completed ? (
                      <CheckCircle2 size={18} className="text-teal-400 flex-shrink-0" />
                    ) : (
                      <Flame size={18} className="text-gray-400 flex-shrink-0" />
                    )}
                    <p className="text-sm font-semibold text-white flex-1">{c.title}</p>
                    <span className="text-xs font-bold text-brand-400">+{c.xpReward} XP</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-dark-500 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${c.completed ? 'bg-teal-500' : 'bg-brand-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {Math.min(c.progress, c.target)}/{c.target}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
