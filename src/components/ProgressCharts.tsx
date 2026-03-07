import { BarChart3, TrendingUp, Activity, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { format, parseISO } from 'date-fns';
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

export default function ProgressCharts() {
  const { state } = useApp();
  const { activeCamp, workoutLogs, sparringLogs, conditioningTests } = state;

  if (!activeCamp) return null;

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

  // Summary stats
  const totalMinutes = campWorkouts.reduce((s, l) => s + l.duration, 0);
  const totalSparringRounds = campSparring.reduce((s, l) => s + l.rounds, 0);
  const avgRpe = campWorkouts.length > 0
    ? (campWorkouts.reduce((s, l) => s + l.rpe, 0) / campWorkouts.length).toFixed(1)
    : '–';

  return (
    <div className="space-y-4 pb-4">
      {/* Summary Cards */}
      <div className="mx-4 mt-4 grid grid-cols-2 gap-3">
        <div className="stat-card">
          <Activity size={16} className="text-brand-500" />
          <div className="text-xl font-black text-white">{campWorkouts.length}</div>
          <div className="text-xs text-gray-500">total sessions</div>
        </div>
        <div className="stat-card">
          <TrendingUp size={16} className="text-purple-400" />
          <div className="text-xl font-black text-white">{Math.round(totalMinutes / 60)}h</div>
          <div className="text-xs text-gray-500">training hours</div>
        </div>
        <div className="stat-card">
          <Zap size={16} className="text-yellow-400" />
          <div className="text-xl font-black text-white">{totalSparringRounds}</div>
          <div className="text-xs text-gray-500">sparring rounds</div>
        </div>
        <div className="stat-card">
          <BarChart3 size={16} className="text-green-400" />
          <div className="text-xl font-black text-white">{avgRpe}</div>
          <div className="text-xs text-gray-500">avg RPE</div>
        </div>
      </div>

      {/* Weekly Volume Chart */}
      {weeklyVolume.some(w => w.sessions > 0) && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Weekly Training Volume</p>
          <div className="card p-2">
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
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Training Intensity (RPE Trend)</p>
          <div className="card p-2">
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
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Conditioning Benchmarks</p>
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
              );
            })}
          </div>
        </div>
      )}

      {/* Sparring Performance Trend */}
      {sparringPerf.length > 1 && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sparring Performance</p>
          <div className="card p-2">
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
          <div className="flex justify-between text-xs text-gray-600 px-2 mt-1">
            <span>1=Poor</span><span>2=Below</span><span>3=Avg</span><span>4=Good</span><span>5=Excellent</span>
          </div>
        </div>
      )}

      {/* Weekly RPE vs Sparring */}
      {weeklyVolume.some(w => w.avgRpe > 0) && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Weekly Avg RPE</p>
          <div className="card p-2">
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
          <BarChart3 size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-semibold">No data yet</p>
          <p className="text-sm text-gray-600 mt-1">Start logging workouts and tests to see your progress charts</p>
        </div>
      )}
    </div>
  );
}
