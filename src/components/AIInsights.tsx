import { useState } from 'react';
import { Brain, RefreshCw, AlertCircle, Sparkles, User, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { toDisplayWeight, formatWeight, formatWeightDelta } from '../utils/units';
import { getDaysUntilFight, getCurrentWeekNumber, getCampProgress } from '../utils/campGenerator';
import { streamAiCoach, AiCoachError, type AiCoachErrorCode } from '../lib/aiCoach';
import AuthScreen from './AuthScreen';
import UpgradeModal from './shared/UpgradeModal';
import { format, parseISO, subDays } from 'date-fns';

function buildPrompt(state: ReturnType<typeof useApp>['state']): string {
  const { activeCamp, currentUser, workoutLogs, sparringLogs, conditioningTests, weightEntries, trainingSchedule, completedSessions } = state;
  if (!activeCamp || !currentUser) return '';

  const campWorkouts = workoutLogs.filter(l => l.campId === activeCamp.id);
  const campSparring = sparringLogs.filter(l => l.campId === activeCamp.id);
  const campCond = conditioningTests.filter(l => l.campId === activeCamp.id);
  const campWeights = weightEntries
    .filter(e => e.campId === activeCamp.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const currentWeekNum = getCurrentWeekNumber(activeCamp);
  const currentWeek = trainingSchedule[currentWeekNum - 1];
  const progress = getCampProgress(activeCamp);
  const daysOut = getDaysUntilFight(activeCamp.fightDate);

  const totalMinutes = campWorkouts.reduce((s, l) => s + l.duration, 0);
  const totalSparRounds = campSparring.reduce((s, l) => s + l.rounds, 0);
  const avgRpe = campWorkouts.length > 0
    ? (campWorkouts.reduce((s, l) => s + l.rpe, 0) / campWorkouts.length).toFixed(1)
    : 'N/A';

  const recentCutoff = format(subDays(new Date(), 14), 'yyyy-MM-dd');
  const recentLogs = campWorkouts
    .filter(l => l.date >= recentCutoff)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);

  const weeklyAdh = trainingSchedule.map(week => {
    const keys = week.days.flatMap(d =>
      d.isRestDay ? [] : d.sessions.map((_, si) => `${activeCamp.id}-${week.weekNumber}-${d.dayOfWeek}-${si}`)
    );
    const total = keys.length;
    const done = keys.filter(k => completedSessions[k]).length;
    return { done, total };
  });
  const totalDone = weeklyAdh.reduce((s, w) => s + w.done, 0);
  const totalPlan = weeklyAdh.reduce((s, w) => s + w.total, 0);
  const adherencePct = totalPlan > 0 ? Math.round((totalDone / totalPlan) * 100) : 0;

  const latestWeight = campWeights[0];
  const currentWeight = latestWeight?.weight ?? activeCamp.currentWeight;
  // Weights in the prompt use the display unit so the coach voice replies in it.
  const unit = state.dashboardPrefs?.weightUnit ?? 'lbs';

  const recentSpar = [...campSparring]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return `You are an expert ${activeCamp.sport} coach and performance analyst. Analyze this fighter's data and provide sharp, personalized insights.

## Fighter
- Name: ${currentUser.name} | Sport: ${activeCamp.sport} | Class: ${activeCamp.weightClass}
- Level: ${currentUser.experienceLevel}${currentUser.gym ? ` | Gym: ${currentUser.gym}` : ''}${currentUser.record ? ` | Record: ${currentUser.record}` : ''}

## Fight Camp
- Fight: ${activeCamp.fightDate ? `${format(parseISO(activeCamp.fightDate), 'MMM d, yyyy')} (${daysOut} days out)` : 'no fight scheduled (off-season block)'}${activeCamp.opponent ? ` vs ${activeCamp.opponent}` : ''}
- Format: ${activeCamp.rounds}R × ${activeCamp.roundDuration}min
- Weight: ${formatWeight(currentWeight, unit)} → ${formatWeight(activeCamp.targetWeight, unit)} target (${formatWeightDelta(currentWeight - activeCamp.targetWeight, unit)} to cut)
- Progress: Week ${currentWeekNum}/${activeCamp.campWeeks} · ${progress}%${currentWeek ? ` · ${currentWeek.phase} (${currentWeek.intensity})` : ''}

## Camp Totals
- ${campWorkouts.length} sessions · ${Math.round(totalMinutes / 60)}h training · ${totalSparRounds} sparring rds · Avg RPE ${avgRpe}
- Schedule adherence: ${adherencePct}% (${totalDone}/${totalPlan} planned sessions)

## Last 14 Days
${recentLogs.length > 0
  ? recentLogs.map(l => `- ${format(parseISO(l.date), 'M/d')} ${l.sessionType.toUpperCase()} "${l.title}" ${l.duration}min RPE${l.rpe}${l.notes ? ` — "${l.notes}"` : ''}`).join('\n')
  : '- No sessions logged'}

## Weight (last 8)
${campWeights.slice(0, 8).length > 0
  ? campWeights.slice(0, 8).map(e => `${format(parseISO(e.date), 'M/d')}: ${toDisplayWeight(e.weight, unit)}${unit}`).join(' · ')
  : 'No entries'}

## Conditioning
${campCond.slice(0, 6).length > 0
  ? campCond.slice(0, 6).map(t => `${format(parseISO(t.date), 'M/d')} ${t.testType}: ${t.value}${t.unit} (W${t.weekNumber})`).join(' · ')
  : 'No tests'}

## Sparring (last 5)
${recentSpar.length > 0
  ? recentSpar.map(s => `- ${format(parseISO(s.date), 'M/d')} ${s.rounds}×${s.roundDuration}min ${s.partnerName && s.partnerName !== 'Unknown' ? `vs ${s.partnerName} ` : ''}(${s.partnerLevel} level) ${s.performance}/5 — "${s.focus}"`).join('\n')
  : '- None logged'}

---

Provide a training analysis report. Use these exact headers. Be specific with numbers. Direct coach voice.

**1. Camp Assessment**
Overall trajectory. What's working, what isn't. Be honest.

**2. Training Load**
Volume/intensity analysis. Overtraining risk or under-preparation. RPE patterns.

**3. Weight Cut**
Pace vs. what's needed. On track? What adjustments?

**4. Combat Readiness**
Based on sparring performance and trends.

**5. Top 3 Action Items**
Three specific, immediately executable priorities for the next 7 days.

**6. Coach's Message**
Two sentences. Direct and motivating.`;
}

// Very basic markdown bold renderer
function renderInsights(text: string) {
  return text.split('\n').map((line, i) => {
    // Section headers: **1. Title**
    const headerMatch = line.match(/^\*\*(\d+\..+?)\*\*/);
    if (headerMatch) {
      return (
        <p key={i} className="text-brand-400 font-bold text-sm mt-5 mb-1.5 uppercase tracking-wide">
          {headerMatch[1]}
        </p>
      );
    }
    // Bold inline text
    const parts = line.split(/\*\*(.+?)\*\*/g);
    const rendered = parts.map((part, j) =>
      j % 2 === 1 ? <strong key={j} className="text-white font-semibold">{part}</strong> : part
    );
    // Bullet points
    if (line.startsWith('- ')) {
      return (
        <div key={i} className="flex gap-2 py-0.5">
          <span className="text-brand-600 mt-1 flex-shrink-0">•</span>
          <span className="text-gray-300 text-sm leading-relaxed">{rendered.slice(1)}</span>
        </div>
      );
    }
    if (!line.trim()) return <div key={i} className="h-1" />;
    return <p key={i} className="text-gray-300 text-sm leading-relaxed">{rendered}</p>;
  });
}

export default function AIInsights() {
  const { state } = useApp();
  const { activeCamp } = state;

  const [insights, setInsights] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<AiCoachErrorCode | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  async function generate() {
    if (!activeCamp) return;

    setLoading(true);
    setError('');
    setErrorCode(null);
    setInsights('');

    try {
      await streamAiCoach('insights', buildPrompt(state), text => {
        setInsights(prev => prev + text);
      });
    } catch (err) {
      if (err instanceof AiCoachError) {
        setError(err.message);
        setErrorCode(err.code);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (!activeCamp) {
    return (
      <div className="mx-4 mt-4 card text-center py-12">
        <Brain size={40} className="text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400 font-semibold">No active fight camp</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header card */}
      <div className="mx-4 mt-4 bg-gradient-to-br from-purple-900/30 to-dark-700 rounded-2xl border border-purple-900/40 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-900/40 flex items-center justify-center flex-shrink-0">
            <Brain size={20} className="text-purple-400" />
          </div>
          <div className="flex-1">
            <p className="text-white font-bold">AI Coach Insights</p>
            <p className="text-xs text-gray-500">Included with Pro — no setup needed</p>
          </div>
          <Sparkles size={16} className="text-purple-400" />
        </div>
      </div>

      {/* Generate button */}
      <div className="mx-4">
        <button
          onClick={generate}
          disabled={loading}
          className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-98 ${
            loading
              ? 'bg-purple-900/40 border border-purple-800 text-purple-300 cursor-not-allowed'
              : 'bg-purple-700 hover:bg-purple-600 text-white'
          }`}
        >
          {loading ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              Analyzing your camp data…
            </>
          ) : (
            <>
              <Brain size={16} />
              {insights ? 'Regenerate Insights' : 'Generate AI Insights'}
            </>
          )}
        </button>
      </div>

      {/* Error + routed action */}
      {error && (
        <div className="mx-4 space-y-2">
          <div className="flex items-start gap-3 bg-red-900/20 border border-red-900/40 rounded-xl p-3">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
          {errorCode === 'signin_required' && (
            <button onClick={() => setShowAuth(true)} className="btn-primary w-full text-sm flex items-center justify-center gap-2">
              <User size={14} /> Sign in
            </button>
          )}
          {errorCode === 'upgrade_required' && (
            <button onClick={() => setShowUpgrade(true)} className="btn-primary w-full text-sm flex items-center justify-center gap-2">
              <Zap size={14} /> Unlock with Fighter Pro
            </button>
          )}
        </div>
      )}

      {/* Insights output */}
      {(insights || loading) && (
        <div className="mx-4 card">
          {loading && !insights && (
            <div className="flex items-center gap-2 text-purple-400 text-sm">
              <RefreshCw size={14} className="animate-spin" />
              Your AI coach is analyzing the training data…
            </div>
          )}
          <div className="space-y-0.5">
            {renderInsights(insights)}
            {loading && insights && (
              <span className="inline-block w-2 h-4 bg-purple-400 ml-1 animate-pulse rounded-sm" />
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !insights && !error && (
        <div className="mx-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">What you'll get</p>
          {[
            { icon: '📊', label: 'Camp Assessment', desc: 'Overall trajectory and what\'s working' },
            { icon: '⚡', label: 'Training Load Analysis', desc: 'Volume, intensity & overtraining risk' },
            { icon: '⚖️', label: 'Weight Cut Status', desc: 'Pace check and adjustments needed' },
            { icon: '🥊', label: 'Combat Readiness', desc: 'Sparring trends and fight prep' },
            { icon: '🎯', label: 'Top 3 Action Items', desc: 'Specific priorities for next 7 days' },
            { icon: '💬', label: "Coach's Message", desc: 'Direct motivation from your AI coach' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3 py-2 border-b border-dark-600 last:border-0">
              <span className="text-xl">{item.icon}</span>
              <div>
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
