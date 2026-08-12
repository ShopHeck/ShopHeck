import { Fragment } from 'react';
import { useApp } from '../../context/AppContext';
import { effectiveIds, resolvePinned, type HomeMode } from '../../utils/homeLayout';
import ProgressWidget from '../gamification/ProgressWidget';
import RecentActivityCard from './RecentActivityCard';
import WeightStatusCard from './WeightStatusCard';
import PhaseGoalsCard from './PhaseGoalsCard';
import SessionMixCard from './SessionMixCard';
import type { View } from '../../types';

interface Props {
  mode: HomeMode;
  accent: string;
  onNavigate: (view: View) => void;
}

/**
 * The cards the fighter pinned, in the order they pinned them.
 *
 * The id→component mapping is the only place a card's identity and its
 * rendering meet; everything else about it — title, icon, which Homes it
 * belongs to, whether it ships pinned — is data in `utils/homeLayout.ts`. A
 * card that is in the registry but missing here renders nothing rather than
 * throwing, which is the safe direction: the registry is also what More lists,
 * so the failure mode is a switch that does nothing rather than a Home that
 * white-screens.
 */
export default function HomeCards({ mode, accent, onNavigate }: Props) {
  const { state } = useApp();
  const cards = resolvePinned(effectiveIds(state.dashboardPrefs, 'card', mode), 'card', mode);

  return (
    <>
      {cards.map(card => (
        <Fragment key={card.id}>
          {card.id === 'belt-streak' && (
            <ProgressWidget onOpenProgress={() => onNavigate('achievements')} />
          )}
          {card.id === 'recent-activity' && (
            <RecentActivityCard accent={accent} onSeeAll={() => onNavigate('log')} />
          )}
          {card.id === 'weight-status' && (
            <WeightStatusCard accent={accent} onOpen={() => onNavigate('weight')} />
          )}
          {card.id === 'phase-goals' && (
            <PhaseGoalsCard accent={accent} onOpenPlanner={() => onNavigate('planner')} />
          )}
          {card.id === 'training-variety' && <SessionMixCard />}
        </Fragment>
      ))}
    </>
  );
}
