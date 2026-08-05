import { useState } from 'react';
import { Brain, RefreshCw, AlertCircle, Sparkles, User, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import GlassSurface from './shared/GlassSurface';
import { tint } from '../utils/designTokens';
import { toDisplayWeight, formatWeight, formatWeightDelta } from '../utils/units';
import { getDaysUntilFight, getCurrentWeekNumber, getCampProgress } from '../utils/campGenerator';
import { scheduleAdherence } from '../utils/adherence';
import { streamAiCoach, AiCoachError, type AiCoachErrorCode } from '../lib/aiCoach';
import { aiAnalysisKey } from '../utils/storage';
import AuthScreen from './AuthScreen';
import UpgradeModal from './shared/UpgradeModal';
import { format, parseISO, subDays } from 'date-fns';

function buildPrompt(state: ReturnType<typeof useApp>['state']): string {
  const { activeCamp, currentUser, workoutLogs, sparringLogs, conditioningTests, weightEntries, trainingSchedule, completedSessions } = state;
  if (!activeCamp || !currentUser) return '';

  const campWorkouts = workoutLogs.filter(l => l.campId === activeCamp.id);
  const campSparring = sparringLogs.filter(l => l.campId === activeCamp.id);
  // Sorted newest-first before the prompt slices it — an unsorted slice fed
  // an arbitrary six tests into an analysis the subscription paid for.
  const campCond = conditioningTests
    .filter(l => l.campId === activeCamp.id)
    .sort((a, b) => b.date.localeCompare(a.date));
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

  // Shared definition — see utils/adherence.ts.
  const campScore = scheduleAdherence(completedSessions, activeCamp.id, trainingSchedule);
  const totalDone = campScore.done;
  const totalPlan = campScore.planned;
  const adherencePct = campScore.pct ?? 0;

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
  const { state, dispatch } = useApp();
  const { activeCamp } = state;

  // The saved analysis for this camp, if one has been generated before.
  const saved = activeCamp
    ? state.aiAnalyses?.[aiAnalysisKey('insights', activeCamp.id)]
    : undefined;

  // In-flight streaming text, tagged with the camp it belongs to. Tagging (as
  // opposed to seeding a plain string from `saved`) is what keeps the display
  // honest if the active camp changes while this screen is mounted: a draft for
  // another camp is simply not shown, so no effect has to chase the switch.
  //
  // The completed text is committed to app state once, not per token —
  // dispatching per chunk would run the reducer and re-render every consumer
  // hundreds of times for a single generation.
  const [draft, setDraft] = useState<{ subjectId: string; content: string } | null>(null);
  const insights = draft && draft.subjectId === activeCamp?.id
    ? draft.content
    : saved?.content ?? '';
  const setInsights = (update: (prev: string) => string) => {
    if (!activeCamp) return;
    setDraft(d => ({
      subjectId: activeCamp.id,
      content: update(d?.subjectId === activeCamp.id ? d.content : ''),
    }));
  };
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
    setDraft({ subjectId: activeCamp.id, content: '' });

    let streamed = '';
    try {
      await streamAiCoach('insights', buildPrompt(state), text => {
        streamed += text;
        setInsights(prev => prev + text);
      });
      // Only a completed stream is worth keeping. A run that threw partway
      // leaves the partial text on screen (the user can see what arrived) but
      // does not persist a truncated analysis as if it were the finished one.
      if (streamed.trim()) {
        dispatch({
          type: 'SAVE_AI_ANALYSIS',
          payload: { kind: 'insights', subjectId: activeCamp.id, content: streamed },
        });
      }
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
        <Brain size={40} className="text-gray-450 mx-auto mb-3" />
        <p className="text-gray-400 font-semibold">No active fight camp</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header card */}
      {/* Violet is correct here and nowhere else: this IS the AI Coach
          Insights feature, which is the one thing violet brands (§2.6). The
          other AI-generated surfaces — Cut Coach, Macro Generator, Generate
          Meal — stay flame with a sparkle icon as the "AI made this" signal. */}
      <GlassSurface
        cornerRadius="lg"
        elevated
        accentGlow={loading ? 'rgb(var(--accent-violet-rgb) / 0.4)' : undefined}
        className="mx-4 mt-4 p-4"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: tint('var(--accent-violet)', 0.18),
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-violet)',
            }}
          >
            <Brain size={20} />
          </div>
          <div className="flex-1">
            <p className="type-card-title text-white">AI Coach Insights</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Included with Pro — no setup needed
            </p>
          </div>
          <Sparkles size={16} style={{ color: 'var(--accent-violet)' }} />
        </div>
      </GlassSurface>

      {/* Generate button */}
      <div className="mx-4">
        <button
          onClick={generate}
          disabled={loading}
          className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm pressable ${loading ? 'ai-pulse cursor-not-allowed' : ''}`}
          style={
            loading
              ? {
                  backgroundColor: tint('var(--accent-violet)', 0.2),
                  border: '1px solid ' + tint('var(--accent-violet)', 0.5),
                  color: 'var(--accent-violet)',
                }
              : { backgroundColor: 'var(--accent-violet)', color: 'var(--text-primary)' }
          }
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
          {/* §4.2: a failed request is a retry prompt, not a danger state, so
              the crimson stays on the icon rather than recolouring the card. */}
          <GlassSurface cornerRadius="md" className="flex items-start gap-3 p-3">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-crimson)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
          </GlassSurface>
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
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent-violet)' }}>
              <RefreshCw size={14} className="animate-spin" />
              Your AI coach is analyzing the training data…
            </div>
          )}
          <div className="space-y-0.5">
            {renderInsights(insights)}
            {loading && insights && (
              <span className="inline-block w-2 h-4 ml-1 animate-pulse rounded-sm" style={{ backgroundColor: 'var(--accent-violet)' }} />
            )}
          </div>
          {/* Dates a restored analysis, so a week-old read isn't mistaken for a
              fresh one. Only shown when the text on screen IS the saved text —
              during a regenerate the old timestamp would be a lie. */}
          {!loading && saved && insights === saved.content && (
            <p className="text-xs text-gray-450 mt-3 pt-3 border-t border-dark-600">
              Generated {format(parseISO(saved.generatedAt), 'MMM d, h:mm a')}
            </p>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && !insights && !error && (
        <div className="mx-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">What you'll get</p>
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
                <p className="text-xs text-gray-400">{item.desc}</p>
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
