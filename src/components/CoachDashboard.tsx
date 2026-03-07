import { useState } from 'react';
import { Users, ChevronRight, Activity, Scale, Zap, User, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { format, parseISO } from 'date-fns';
import { getDaysUntilFight, getCampProgress } from '../utils/campGenerator';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; color: string }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-dark-700 border border-dark-400 rounded-lg px-3 py-2 text-xs">
        <p className="text-gray-400">{label}</p>
        {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.value}</p>)}
      </div>
    );
  }
  return null;
}


export default function CoachDashboard() {
  const { state } = useApp();
  const { fighters, camps, workoutLogs, sparringLogs, weightEntries } = state;
  const [selectedFighter, setSelectedFighter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const activeFighters = fighters.filter(f => f.role === 'fighter');
  const filtered = activeFighters.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.sport.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fighter = selectedFighter ? fighters.find(f => f.id === selectedFighter) : null;

  // For demo, just use the most recent camp
  const activeCamp = camps[camps.length - 1];

  if (selectedFighter && activeCamp) {
    const campWorkouts = workoutLogs.filter(l => l.campId === activeCamp.id);
    const campSparring = sparringLogs.filter(l => l.campId === activeCamp.id);
    const campWeights = weightEntries
      .filter(e => e.campId === activeCamp.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const daysUntil = getDaysUntilFight(activeCamp.fightDate);
    const progress = getCampProgress(activeCamp);
    const latestWeight = campWeights[campWeights.length - 1];
    const currentW = latestWeight ? latestWeight.weight : activeCamp.currentWeight;

    const weeklyStats: Record<number, { week: number; sessions: number; sparRounds: number }> = {};
    for (let i = 1; i <= activeCamp.campWeeks; i++) {
      weeklyStats[i] = { week: i, sessions: 0, sparRounds: 0 };
    }
    campWorkouts.forEach(l => { if (weeklyStats[l.weekNumber]) weeklyStats[l.weekNumber].sessions++; });
    campSparring.forEach(l => { if (weeklyStats[l.weekNumber]) weeklyStats[l.weekNumber].sparRounds += l.rounds; });
    const weeklyData = Object.values(weeklyStats);

    const weightChartData = [
      { date: 'Start', weight: activeCamp.currentWeight },
      ...campWeights.map(e => ({ date: format(parseISO(e.date), 'M/d'), weight: e.weight })),
    ];

    return (
      <div className="space-y-4 pb-4">
        <div className="mx-4 mt-4">
          <button onClick={() => setSelectedFighter(null)} className="flex items-center gap-2 text-brand-500 text-sm font-medium mb-4">
            ← Back to Fighters
          </button>

          {/* Fighter Header */}
          <div className="card flex items-center gap-4">
            <div className="w-14 h-14 bg-brand-900/50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <User size={28} className="text-brand-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-black text-white">{fighter?.name}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="badge bg-dark-500 text-gray-400 text-xs">{fighter?.sport}</span>
                <span className="badge bg-dark-500 text-gray-400 text-xs">{fighter?.weightClass}</span>
                <span className="badge bg-dark-500 text-gray-400 text-xs">{fighter?.experienceLevel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Fight Camp Info */}
        <div className="mx-4">
          <div className="bg-gradient-to-br from-brand-900/40 to-dark-700 border border-brand-800/40 rounded-xl p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-brand-400 font-semibold uppercase tracking-wider">Active Camp</p>
                <p className="text-2xl font-black text-white mt-1">{daysUntil} days out</p>
                <p className="text-xs text-gray-500">{format(parseISO(activeCamp.fightDate), 'MMM d, yyyy')}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-white">{activeCamp.rounds}R</p>
                <p className="text-xs text-gray-500">{activeCamp.roundDuration}min</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Camp Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-dark-500 rounded-full">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mx-4 grid grid-cols-3 gap-3">
          <div className="stat-card">
            <Activity size={14} className="text-brand-500" />
            <div className="text-lg font-black text-white">{campWorkouts.length}</div>
            <div className="text-xs text-gray-500">sessions</div>
          </div>
          <div className="stat-card">
            <Zap size={14} className="text-yellow-400" />
            <div className="text-lg font-black text-white">{campSparring.reduce((s, l) => s + l.rounds, 0)}</div>
            <div className="text-xs text-gray-500">spar rounds</div>
          </div>
          <div className="stat-card">
            <Scale size={14} className="text-blue-400" />
            <div className="text-lg font-black text-white">{currentW}</div>
            <div className="text-xs text-gray-500">lbs now</div>
          </div>
        </div>

        {/* Weekly Sessions Chart */}
        {weeklyData.some(w => w.sessions > 0) && (
          <div className="mx-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Weekly Activity</p>
            <div className="card p-2">
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="week" tick={{ fill: '#666', fontSize: 10 }} tickFormatter={v => `W${v}`} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="sessions" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316' }} name="Sessions" />
                  <Line type="monotone" dataKey="sparRounds" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: '#60a5fa' }} name="Spar Rds" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Weight Trend */}
        {weightChartData.length > 1 && (
          <div className="mx-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Weight Trend</p>
            <div className="card p-2">
              <div className="flex justify-between text-xs text-gray-500 mb-2 px-1">
                <span>Current: {currentW} lbs</span>
                <span>Target: {activeCamp.targetWeight} lbs</span>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={weightChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="weight" stroke="#60a5fa" strokeWidth={2.5} dot={{ r: 3, fill: '#60a5fa' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Recent Sparring */}
        {campSparring.length > 0 && (
          <div className="mx-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Sparring</p>
            <div className="space-y-2">
              {campSparring.slice(0, 5).map(s => (
                <div key={s.id} className="card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{s.rounds} rounds vs {s.partnerName}</p>
                    <p className="text-xs text-gray-500">{format(parseISO(s.date), 'MMM d')} · Week {s.weekNumber}</p>
                    {s.focus && <p className="text-xs text-gray-600 mt-0.5">Focus: {s.focus}</p>}
                  </div>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${
                    s.performance >= 4 ? 'bg-green-900/40 text-green-400' :
                    s.performance >= 3 ? 'bg-yellow-900/40 text-yellow-400' :
                    'bg-red-900/40 text-red-400'
                  }`}>
                    {s.performance}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="mx-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-white">Coach View</h2>
            <p className="text-sm text-gray-500">{activeFighters.length} fighter{activeFighters.length !== 1 ? 's' : ''} in system</p>
          </div>
          <div className="w-10 h-10 bg-brand-900/40 rounded-xl flex items-center justify-center">
            <Users size={18} className="text-brand-400" />
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-9"
            placeholder="Search fighters..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Camp Overview */}
        {activeCamp && (
          <div className="bg-gradient-to-br from-dark-700 to-dark-600 border border-dark-400 rounded-xl p-4 mb-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Active Camp Overview</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="text-2xl font-black text-white">{getDaysUntilFight(activeCamp.fightDate)}</div>
                <div className="text-xs text-gray-500">days out</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-white">{workoutLogs.filter(l => l.campId === activeCamp.id).length}</div>
                <div className="text-xs text-gray-500">sessions logged</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-brand-400">{getCampProgress(activeCamp)}%</div>
                <div className="text-xs text-gray-500">camp progress</div>
              </div>
            </div>
          </div>
        )}

        {/* Fighter List */}
        {filtered.length === 0 ? (
          <div className="card text-center py-10">
            <Users size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No fighters found</p>
            <p className="text-sm text-gray-600 mt-1">
              {activeFighters.length === 0
                ? 'No fighters have created accounts yet'
                : 'No fighters match your search'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(f => {
              const fCamp = camps[camps.length - 1]; // Demo: latest camp
              const fWorkouts = workoutLogs.filter(l => fCamp && l.campId === fCamp.id);
              const fSparring = sparringLogs.filter(l => fCamp && l.campId === fCamp.id);

              return (
                <button
                  key={f.id}
                  onClick={() => setSelectedFighter(f.id)}
                  className="w-full card hover:border-brand-700 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-brand-900/50 to-dark-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-brand-400 font-black text-lg">{f.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white">{f.name}</p>
                        {f.gym && <span className="text-xs text-gray-600">· {f.gym}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="badge bg-dark-500 text-gray-500 text-xs">{f.sport}</span>
                        <span className="badge bg-dark-500 text-gray-500 text-xs">{f.weightClass}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-600" />
                  </div>

                  {fCamp && (
                    <div className="mt-3 pt-3 border-t border-dark-500 grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{fWorkouts.length}</p>
                        <p className="text-xs text-gray-600">sessions</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{fSparring.reduce((s, l) => s + l.rounds, 0)}</p>
                        <p className="text-xs text-gray-600">spar rds</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-brand-400">{getDaysUntilFight(fCamp.fightDate)}d</p>
                        <p className="text-xs text-gray-600">to fight</p>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
