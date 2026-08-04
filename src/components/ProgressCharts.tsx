import { BarChart3, TrendingUp, Activity, Zap, Share2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { format, parseISO } from 'date-fns';
import { getDaysUntilFight, getCampProgress } from '../utils/campGenerator';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const CHART_COLORS = ['#f97316', '#60a5fa', '#a78bfa', '#34d399', '#f87171'];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-dark-700 border border-dark-400 rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-gray-400 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {p.value}</p>
        ))}
      </div>
    );
  }
  return null;
}

function shareStats(opts: {
  name: string; sport: string; weightClass: string;
  sessions: number; hours: number; sparringRounds: number;
  avgRpe: string; adherence: number; daysOut: number; progress: number;
  opponent?: string;
}) {
  const canvas = document.createElement('canvas');
  const W = 800, H = 480;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0a0a');
  bg.addColorStop(1, '#1a0a00');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Orange accent bar
  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, 0, W, 5);

  // App name
  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('FIGHT CAMP', 40, 48);

  // Fighter name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillText(opts.name, 40, 100);

  // Tags
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = '#9ca3af';
  ctx.fillText(`${opts.sport} · ${opts.weightClass}`, 40, 128);
  if (opts.opponent) {
    ctx.fillStyle = '#f97316';
    ctx.fillText(`vs ${opts.opponent}`, 40, 150);
  }

  // Divider
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 170); ctx.lineTo(W - 40, 170);
  ctx.stroke();

  // Stats grid
  const stats = [
    { label: 'SESSIONS', value: String(opts.sessions), color: '#f97316' },
    { label: 'TRAINING HRS', value: `${opts.hours}h`, color: '#a78bfa' },
    { label: 'SPAR ROUNDS', value: String(opts.sparringRounds), color: '#facc15' },
    { label: 'AVG RPE', value: opts.avgRpe, color: '#34d399' },
    { label: 'ADHERENCE', value: `${opts.adherence}%`, color: '#60a5fa' },
    { label: 'DAYS OUT', value: String(opts.daysOut), color: '#f87171' },
  ];

  const colW = (W - 80) / 3;
  stats.forEach((s, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 40 + col * colW;
    const y = 200 + row * 110;

    ctx.fillStyle = s.color;
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillText(s.value, x, y + 40);

    ctx.fillStyle = '#6b7280';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(s.label, x, y + 60);
  });

  // Progress bar
  const barY = H - 60;
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.roundRect(40, barY, W - 80, 12, 6);
  ctx.fill();

  const grad = ctx.createLinearGradient(40, 0, W - 40, 0);
  grad.addColorStop(0, '#b45309'); grad.addColorStop(1, '#f97316');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(40, barY, (W - 80) * (opts.progress / 100), 12, 6);
  ctx.fill();

  ctx.fillStyle = '#6b7280';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`Camp Progress: ${opts.progress}%`, 40, H - 20);

  // Brand watermark — the shared image is the app's only outbound artifact.
  ctx.fillStyle = '#4b5563';
  ctx.textAlign = 'right';
  ctx.fillText('fightcamp.netlify.app', W - 40, H - 20);
  ctx.textAlign = 'left';

  canvas.toBlob(async blob => {
    if (!blob) return;
    const file = new File([blob], 'fight-camp-stats.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `${opts.name}'s Fight Camp Stats` });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'fight-camp-stats.png'; a.click();
      URL.revokeObjectURL(url);
    }
  }, 'image/png');
}

export default function ProgressCharts() {
  const { state } = useApp();
  const { activeCamp, workoutLogs, sparringLogs, conditioningTests, trainingSchedule, completedSessions, currentUser } = state;

  // Coaches never own a camp, and a fighter may not have started one yet —
  // show a friendly empty state instead of a blank screen.
  if (!activeCamp) {
    const isCoach = currentUser?.role === 'coach';
    return (
      <div className="mx-4 mt-10 card text-center py-12">
        <BarChart3 size={32} className="text-gray-450 mx-auto mb-3" />
        <p className="text-gray-400 font-medium">No progress to show yet</p>
        <p className="text-sm text-gray-450 mt-1 max-w-xs mx-auto">
          {isCoach
            ? 'Progress charts track an individual camp. Open the Fighters tab to view each athlete’s training progress.'
            : 'Start a fight camp or off-season plan to see your training charts here.'}
        </p>
      </div>
    );
  }

  const campWorkouts = workoutLogs.filter(l => l.campId === activeCamp.id);
  const campSparring = sparringLogs.filter(l => l.campId === activeCamp.id);
  const campCond = conditioningTests.filter(l => l.campId === activeCamp.id);

  // Weekly volume chart
  const weeklyVolume = (() => {
    const byWeek: Record<number, { week: number; sessions: number; minutes: number; sparringRounds: number; rpe: number; count: number }> = {};
    for (let i = 1; i <= activeCamp.campWeeks; i++) {
      byWeek[i] = { week: i, sessions: 0, minutes: 0, sparringRounds: 0, rpe: 0, count: 0 };
    }
    campWorkouts.forEach(l => {
      if (byWeek[l.weekNumber]) {
        byWeek[l.weekNumber].sessions++;
        byWeek[l.weekNumber].minutes += l.duration;
        byWeek[l.weekNumber].rpe += l.rpe;
        byWeek[l.weekNumber].count++;
      }
    });
    campSparring.forEach(l => {
      if (byWeek[l.weekNumber]) {
        byWeek[l.weekNumber].sparringRounds += l.rounds;
      }
    });
    return Object.values(byWeek).map(w => ({
      ...w,
      avgRpe: w.count > 0 ? parseFloat((w.rpe / w.count).toFixed(1)) : 0,
    }));
  })();

  // RPE trend
  const rpeTrend = campWorkouts
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-15)
    .map(l => ({
      date: format(parseISO(l.date), 'M/d'),
      rpe: l.rpe,
      title: l.title,
    }));

  // Conditioning benchmarks by test type
  const condByType: Record<string, Array<{ date: string; value: number; week: number }>> = {};
  campCond.forEach(t => {
    if (!condByType[t.testType]) condByType[t.testType] = [];
    condByType[t.testType].push({
      date: format(parseISO(t.date), 'M/d'),
      value: t.value,
      week: t.weekNumber,
    });
  });
  // Sort each by date
  Object.keys(condByType).forEach(k => {
    condByType[k].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  });

  // Sparring performance trend
  const sparringPerf = campSparring
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(l => ({
      date: format(parseISO(l.date), 'M/d'),
      performance: l.performance,
      rounds: l.rounds,
    }));

  // Weekly adherence from completedSessions
  const weeklyAdherence = trainingSchedule.map(week => {
    const keys = week.days.flatMap(d =>
      d.isRestDay ? [] : d.sessions.map((_, si) => `${activeCamp.id}-${week.weekNumber}-${d.dayOfWeek}-${si}`)
    );
    const total = keys.length;
    const done = keys.filter(k => completedSessions[k]).length;
    return {
      week: week.weekNumber,
      adherence: total > 0 ? Math.round((done / total) * 100) : 0,
      done,
      total,
    };
  });
  const hasAnyAdherence = weeklyAdherence.some(w => w.total > 0);

  // Summary stats
  const totalMinutes = campWorkouts.reduce((s, l) => s + l.duration, 0);
  const totalSparringRounds = campSparring.reduce((s, l) => s + l.rounds, 0);
  const avgRpe = campWorkouts.length > 0
    ? (campWorkouts.reduce((s, l) => s + l.rpe, 0) / campWorkouts.length).toFixed(1)
    : '–';

  const allDone = weeklyAdherence.reduce((s, w) => s + w.done, 0);
  const allTotal = weeklyAdherence.reduce((s, w) => s + w.total, 0);
  const overallAdherence = allTotal > 0 ? Math.round((allDone / allTotal) * 100) : 0;

  function handleShare() {
    shareStats({
      name: currentUser?.name ?? 'Fighter',
      sport: activeCamp!.sport,
      weightClass: activeCamp!.weightClass,
      sessions: campWorkouts.length,
      hours: Math.round(totalMinutes / 60),
      sparringRounds: totalSparringRounds,
      avgRpe: avgRpe === '–' ? '0' : avgRpe,
      adherence: overallAdherence,
      daysOut: getDaysUntilFight(activeCamp!.fightDate),
      progress: getCampProgress(activeCamp!),
      opponent: activeCamp!.opponent,
    });
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Share button */}
      <div className="mx-4 mt-4">
        <button
          onClick={handleShare}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-dark-700 border border-dark-500 text-sm font-semibold text-gray-300 hover:border-brand-600 hover:text-brand-400 transition-all active:scale-98"
        >
          <Share2 size={16} />
          Share Camp Stats
        </button>
      </div>

      {/* Summary Cards */}
      <div className="mx-4 grid grid-cols-2 gap-3">
        <div className="stat-card">
          <Activity size={16} className="text-brand-500" />
          <div className="text-xl font-black text-white">{campWorkouts.length}</div>
          <div className="text-xs text-gray-400">total sessions</div>
        </div>
        <div className="stat-card">
          <TrendingUp size={16} className="text-purple-400" />
          <div className="text-xl font-black text-white">{Math.round(totalMinutes / 60)}h</div>
          <div className="text-xs text-gray-400">training hours</div>
        </div>
        <div className="stat-card">
          <Zap size={16} className="text-yellow-400" />
          <div className="text-xl font-black text-white">{totalSparringRounds}</div>
          <div className="text-xs text-gray-400">sparring rounds</div>
        </div>
        <div className="stat-card">
          <BarChart3 size={16} className="text-green-400" />
          <div className="text-xl font-black text-white">{avgRpe}</div>
          <div className="text-xs text-gray-400">avg RPE</div>
        </div>
        {hasAnyAdherence && (
          <div className="stat-card col-span-2">
            <Activity size={16} className="text-brand-400" />
            <div className="text-xl font-black text-white">{overallAdherence}%</div>
            <div className="text-xs text-gray-400">overall adherence ({allDone}/{allTotal} planned)</div>
          </div>
        )}
      </div>

      {/* Weekly Adherence Chart */}
      {hasAnyAdherence && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Weekly Adherence</p>
          <div role="img" aria-label="Bar chart of planned sessions completed each week of the camp." className="card p-2">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={weeklyAdherence} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="week" tick={{ fill: '#666', fontSize: 10 }} tickFormatter={v => `W${v}`} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = weeklyAdherence.find(w => w.week === label);
                    return (
                      <div className="bg-dark-700 border border-dark-400 rounded-lg px-3 py-2 text-xs shadow-xl">
                        <p className="text-gray-400 mb-1">Week {label}</p>
                        <p className="text-brand-400 font-semibold">{payload[0].value}% done</p>
                        {d && <p className="text-gray-400">{d.done}/{d.total} sessions</p>}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="adherence"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={30}
                  name="Adherence %"
                  fill="#f97316"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Weekly Volume Chart */}
      {weeklyVolume.some(w => w.sessions > 0) && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Weekly Training Volume</p>
          <div role="img" aria-label="Bar chart of training minutes logged each week of the camp." className="card p-2">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={weeklyVolume} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="week" tick={{ fill: '#666', fontSize: 10 }} tickFormatter={v => `W${v}`} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="sessions" fill="#f97316" radius={[4, 4, 0, 0]} name="Sessions" maxBarSize={30} />
                <Bar dataKey="sparringRounds" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Spar Rounds" maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* RPE Trend */}
      {rpeTrend.length > 1 && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Training Intensity (RPE Trend)</p>
          <div role="img" aria-label="Line chart of session intensity, rated 1 to 10, over the camp." className="card p-2">
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={rpeTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 10]} tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="rpe" stroke="#f97316" strokeWidth={2.5} dot={{ fill: '#f97316', r: 3 }} name="RPE" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Conditioning Benchmarks */}
      {Object.keys(condByType).length > 0 && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Conditioning Benchmarks</p>
          <div className="space-y-3">
            {Object.entries(condByType).map(([testType, data], idx) => {
              const first = data[0]?.value;
              const last = data[data.length - 1]?.value;
              const change = last - first;
              // For reps-based tests, higher is better
              const isRepsBased = ['reps', 'level', 'ml/kg/min'].some(u =>
                conditioningTests.find(t => t.testType === testType)?.unit?.includes(u)
              );
              const actuallyImproved = isRepsBased ? change > 0 : change < 0;

              return (
                <div key={testType} className="card p-2">
                  <div className="flex items-center justify-between mb-2 px-2">
                    <p className="text-sm font-semibold text-white">{testType}</p>
                    {data.length >= 2 && (
                      <span className={`badge text-xs ${actuallyImproved ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                        {actuallyImproved ? '↑ Improving' : '↓ Declining'}
                      </span>
                    )}
                  </div>
                  {/* Only the graphic gets role="img" — the test name and trend
                      badge above it are real text worth reading. */}
                  <div
                    role="img"
                    aria-label={
                      data.length >= 2
                        ? `${testType} over time: ${first} to ${last}, ${actuallyImproved ? 'improving' : 'declining'}.`
                        : `${testType}: single result of ${last}.`
                    }
                  >
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                      <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                        strokeWidth={2.5}
                        dot={{ fill: CHART_COLORS[idx % CHART_COLORS.length], r: 4 }}
                        name={testType}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sparring Performance Trend */}
      {sparringPerf.length > 1 && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sparring Performance</p>
          <div role="img" aria-label="Line chart of self-rated sparring performance, 1 to 5, per session." className="card p-2">
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={sparringPerf} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[1, 5]} tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="performance" stroke="#a78bfa" strokeWidth={2.5} dot={{ fill: '#a78bfa', r: 4 }} name="Performance" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-xs text-gray-450 px-2 mt-1">
            <span>1=Poor</span><span>2=Below</span><span>3=Avg</span><span>4=Good</span><span>5=Excellent</span>
          </div>
        </div>
      )}

      {/* Weekly RPE vs Sparring */}
      {weeklyVolume.some(w => w.avgRpe > 0) && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Weekly Avg RPE</p>
          <div role="img" aria-label="Bar chart of average session intensity per week." className="card p-2">
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={weeklyVolume.filter(w => w.avgRpe > 0)} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="week" tick={{ fill: '#666', fontSize: 10 }} tickFormatter={v => `W${v}`} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 10]} tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="avgRpe" stroke="#34d399" strokeWidth={2.5} dot={{ fill: '#34d399', r: 4 }} name="Avg RPE" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Empty State */}
      {campWorkouts.length === 0 && campSparring.length === 0 && campCond.length === 0 && (
        <div className="mx-4 card text-center py-12">
          <BarChart3 size={40} className="text-gray-450 mx-auto mb-3" />
          <p className="text-gray-400 font-semibold">No data yet</p>
          <p className="text-sm text-gray-450 mt-1">Start logging workouts and tests to see your progress charts</p>
        </div>
      )}
    </div>
  );
}
