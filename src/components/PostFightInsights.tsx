import { useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { Brain, RefreshCw, Key, AlertCircle, Sparkles } from 'lucide-react';
import { getApiKey, setApiKey } from '../utils/apiKey';
import type { FightResult, FightCamp } from '../types';
import type { CampKpis } from '../utils/campKpis';
import type { FightAnalysis } from '../utils/fightAnalysis';
import type { WeightProposal } from '../utils/factorTuner';

interface Props {
  camp: FightCamp;
  fight: FightResult;
  kpis: CampKpis;
  analysis: FightAnalysis;
  proposal: WeightProposal;
}

function buildPrompt({ camp, fight, kpis, analysis, proposal }: Props): string {
  const roundLines = fight.rounds
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map(r =>
      `  R${r.roundNumber}: self ${r.selfScore}/5 · cardio ${r.cardio}/5 · pressure ${r.opponentPressure}/5 · dealt ${r.damageDealt} · took ${r.damageTaken}` +
      (r.workedWell ? ` · worked: ${r.workedWell}` : '') +
      (r.didntWork ? ` · didn't: ${r.didntWork}` : '')
    )
    .join('\n');

  return `You are a fight analyst writing a post-fight breakdown for a ${camp.sport} fighter. Be direct, specific, and honest — no filler.

## Fight
${fight.opponent} · ${fight.outcome.toUpperCase()} by ${fight.method}${fight.roundStopped ? ` (R${fight.roundStopped})` : ''}
Total rounds: ${fight.totalRounds}
Style plan followed: ${fight.stylePlanFollowed}/5

## Round-by-Round
${roundLines}

## Camp KPIs (${camp.campWeeks}-week camp)
- Total sessions: ${kpis.totalSessions} · adherence ${Math.round(kpis.adherence * 100)}%
- Avg RPE: ${kpis.avgRpe.toFixed(1)}
- Sparring: ${kpis.sparringRoundsTotal} rounds across ${kpis.sparringSessionsCount} sessions
- Weight cut: ${kpis.weightCutLbs.toFixed(1)} lbs (${kpis.weightCutPaceLbsPerWeek.toFixed(1)} lbs/wk)
- Conditioning delta: ${kpis.conditioningDelta === null ? 'n/a' : kpis.conditioningDelta.toFixed(1) + '%'}
- HRV trend: ${kpis.hrvTrend}
- Nutrition adherence: ${Math.round(kpis.nutritionAdherence * 100)}%

## Rules-Engine Verdict
- Outcome score: ${analysis.outcomeScore.toFixed(2)}
- Cardio verdict: ${analysis.cardioVerdict}
- Weight-cut impact: ${analysis.weightCutImpact}
- Pressure handling: ${analysis.pressureHandling}
- Strengths: ${analysis.strengths.join(' | ') || 'n/a'}
- Weaknesses: ${analysis.weaknesses.join(' | ') || 'n/a'}
- Camp takeaways: ${analysis.campTakeaways.join(' | ') || 'n/a'}

## Proposed next-camp weight changes
${proposal.rationale.join('\n') || '- No major changes suggested.'}

---

Write the post-fight analysis using these exact headers. Use direct coach voice. Reference specific numbers/rounds.

**1. What The Camp Did Right**
Two sentences. Tie specific camp KPIs to what held up in the fight.

**2. What Cost The Fighter**
Two sentences. Root-cause each weakness. Be specific.

**3. Key Moments**
1–3 bullets. The pivotal rounds or decisions.

**4. Next Camp Priorities**
Three bullets. Concrete changes to training focus. Align with the proposed weight changes but explain them as coaching advice, not numbers.

**5. One-Line Takeaway**
One short sentence the fighter will remember.`;
}

function renderInsights(text: string) {
  return text.split('\n').map((line, i) => {
    const headerMatch = line.match(/^\*\*(\d+\..+?)\*\*/);
    if (headerMatch) {
      return (
        <p key={i} className="text-purple-400 font-bold text-sm mt-5 mb-1.5 uppercase tracking-wide">
          {headerMatch[1]}
        </p>
      );
    }
    const parts = line.split(/\*\*(.+?)\*\*/g);
    const rendered = parts.map((part, j) =>
      j % 2 === 1 ? <strong key={j} className="text-white font-semibold">{part}</strong> : part,
    );
    if (line.startsWith('- ')) {
      return (
        <div key={i} className="flex gap-2 py-0.5">
          <span className="text-purple-600 mt-1 flex-shrink-0">•</span>
          <span className="text-gray-300 text-sm leading-relaxed">{rendered.slice(1)}</span>
        </div>
      );
    }
    if (!line.trim()) return <div key={i} className="h-1" />;
    return <p key={i} className="text-gray-300 text-sm leading-relaxed">{rendered}</p>;
  });
}

export default function PostFightInsights(props: Props) {
  const [insights, setInsights] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');

  const hasKey = !!getApiKey();

  async function generate() {
    const apiKey = getApiKey();
    if (!apiKey) { setShowKeyInput(true); return; }

    setLoading(true);
    setError('');
    setInsights('');

    try {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      const prompt = buildPrompt(props);

      const stream = client.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 1500,
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
        setError('Invalid API key.');
        setShowKeyInput(true);
      } else if (err instanceof Anthropic.RateLimitError) {
        setError('Rate limit reached. Wait a moment and try again.');
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

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-purple-900/30 to-dark-700 rounded-2xl border border-purple-900/40 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-900/40 flex items-center justify-center flex-shrink-0">
            <Brain size={20} className="text-purple-400" />
          </div>
          <div className="flex-1">
            <p className="text-white font-bold">AI Post-Fight Breakdown</p>
            <p className="text-xs text-gray-500">Claude writes the narrative. Weights below are rules-based.</p>
          </div>
          <Sparkles size={16} className="text-purple-400" />
        </div>
      </div>

      {showKeyInput && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Key size={15} className="text-yellow-400" />
            <p className="text-sm font-semibold text-white">Anthropic API Key</p>
          </div>
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
              Save & Generate
            </button>
            <button onClick={() => setShowKeyInput(false)} className="btn-secondary px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showKeyInput && (
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
              Generating breakdown…
            </>
          ) : (
            <>
              <Brain size={16} />
              {insights ? 'Regenerate' : 'Generate AI Breakdown'}
            </>
          )}
        </button>
      )}

      {!hasKey && !insights && !showKeyInput && (
        <button
          onClick={() => setShowKeyInput(true)}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs text-gray-500 hover:text-gray-300"
        >
          <Key size={12} /> Add API key
        </button>
      )}

      {error && (
        <div className="flex items-start gap-3 bg-red-900/20 border border-red-900/40 rounded-xl p-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {(insights || loading) && (
        <div className="card">
          {loading && !insights && (
            <div className="flex items-center gap-2 text-purple-400 text-sm">
              <RefreshCw size={14} className="animate-spin" />
              Claude is analyzing the fight…
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
    </div>
  );
}
