import { useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { Brain, RefreshCw, Key, AlertCircle, ChevronRight, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getDaysUntilFight, getCurrentWeekNumber, getCampProgress } from '../utils/campGenerator';
import { getApiKey, setApiKey } from '../utils/apiKey';
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
  const weightToGo = (currentWeight - activeCamp.targetWeight).toFixed(1);

  const recentSpar = [...campSparring]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return `You are an expert ${activeCamp.sport} coach and performance analyst. Analyze this fighter's data and provide sharp, personalized insights.

## Fighter
- Name: ${currentUser.name} | Sport: ${activeCamp.sport} | Class: ${activeCamp.weightClass}
- Level: ${currentUser.experienceLevel}${currentUser.gym ? ` | Gym: ${currentUser.gym}` : ''}${currentUser.record ? ` | Record: ${currentUser.record}` : ''}

## Fight Camp
- Fight: ${format(parseISO(activeCamp.fightDate ?? ''), 'MMM d, yyyy')} (${daysOut} days out)${activeCamp.opponent ? ` vs ${activeCamp.opponent}` : ''}
- Format: ${activeCamp.rounds}R × ${activeCamp.roundDuration}min
- Weight: ${currentWeight} lbs → ${activeCamp.targetWeight} lbs target (${weightToGo} lbs to cut)
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
  ? campWeights.slice(0, 8).map(e => `${format(parseISO(e.date), 'M/d')}: ${e.weight}lbs`).join(' · ')
  : 'No entries'}

## Conditioning
${campCond.slice(0, 6).length > 0
  ? campCond.slice(0, 6).map(t => `${format(parseISO(t.date), 'M/d')} ${t.testType}: ${t.value}${t.unit} (W${t.weekNumber})`).join(' · ')
  : 'No tests'}

## Sparring (last 5)
${recentSpar.length > 0
  ? recentSpar.map(s => `- ${format(parseISO(s.date), 'M/d')} ${s.rounds}×${s.roundDuration}min vs ${s.partnerName} (${s.partnerLevel}) ${s.performance}/5 — "${s.focus}"`).join('\n')
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
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');

  const hasKey = !!getApiKey();

  async function generate() {
    const apiKey = getApiKey();
    if (!apiKey) { setShowKeyInput(true); return; }
    if (!activeCamp) return;

    setLoading(true);
    setError('');
    setInsights('');

    try {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      const prompt = buildPrompt(state);

      const stream = client.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta' &&
          'text' in event.delta
        ) {
          setInsights(prev => prev + (event.delta as { type: 'text_delta'; text: string }).text);
        }
      }
    } catch (err) {
      setInsights('');
      if (err instanceof Anthropic.AuthenticationError) {
        setError('Invalid API key. Please check your key in settings.');
        setShowKeyInput(true);
      } else if (err instanceof Anthropic.RateLimitError) {
        setError('Rate limit reached. Please wait a moment and try again.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  function saveKey() {
    setApiKey(keyDraft.trim());
    setShowKeyInput(false);
    setKeyDraft('');
    if (keyDraft.trim()) generate();
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
            <p className="text-xs text-gray-500">Powered by Claude Opus · Adaptive thinking</p>
          </div>
          <Sparkles size={16} className="text-purple-400" />
        </div>
      </div>

      {/* API key setup */}
      {showKeyInput && (
        <div className="mx-4 card space-y-3">
          <div className="flex items-center gap-2">
            <Key size={15} className="text-yellow-400" />
            <p className="text-sm font-semibold text-white">Anthropic API Key</p>
          </div>
          <p className="text-xs text-gray-500">
            Enter your API key from{' '}
            <span className="text-brand-400">console.anthropic.com</span>.
            It's stored only on this device.
          </p>
          <input
            type="password"
            className="input font-mono text-sm"
            placeholder="sk-ant-..."
            value={keyDraft}
            onChange={e => setKeyDraft(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={saveKey}
              disabled={!keyDraft.trim().startsWith('sk-')}
              className="btn-primary flex-1 py-2 text-sm disabled:opacity-50"
            >
              Save Key & Generate
            </button>
            <button
              onClick={() => setShowKeyInput(false)}
              className="btn-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Generate button */}
      {!showKeyInput && (
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
          {!hasKey && !insights && (
            <button
              onClick={() => setShowKeyInput(true)}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <Key size={12} /> Add API key
            </button>
          )}
          {hasKey && (
            <button
              onClick={() => { setShowKeyInput(true); setKeyDraft(''); }}
              className="w-full mt-1.5 flex items-center justify-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors py-1"
            >
              <Key size={11} /> Change API key
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 flex items-start gap-3 bg-red-900/20 border border-red-900/40 rounded-xl p-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Insights output */}
      {(insights || loading) && (
        <div className="mx-4 card">
          {loading && !insights && (
            <div className="flex items-center gap-2 text-purple-400 text-sm">
              <RefreshCw size={14} className="animate-spin" />
              Claude is analyzing your training data…
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
      {!loading && !insights && !error && !showKeyInput && (
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
              <ChevronRight size={14} className="text-gray-600 ml-auto" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
