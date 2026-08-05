import { Flame, Dumbbell } from 'lucide-react';
import ChoiceTile from './ChoiceTile';
import ChoiceRow from './ChoiceRow';
import { CAMP_ACCENT, OFF_SEASON_ACCENT, OFF_SEASON_GOALS } from './config';
import { weightRangeHint } from '../../utils/validation';
import type { WeightUnit } from '../../utils/units';
import type { OffSeasonGoal } from '../../types';

interface Props {
  unit: WeightUnit;
  /** Hides the mode toggle — the caller has already committed to off-season. */
  offSeasonOnly?: boolean;
  isOffSeason: boolean;
  onIsOffSeasonChange: (v: boolean) => void;
  offSeasonGoal: OffSeasonGoal;
  onOffSeasonGoalChange: (v: OffSeasonGoal) => void;
  fightDate: string;
  onFightDateChange: (v: string) => void;
  opponent: string;
  onOpponentChange: (v: string) => void;
  rounds: string;
  onRoundsChange: (v: string) => void;
  roundDuration: string;
  onRoundDurationChange: (v: string) => void;
  currentWeight: string;
  onCurrentWeightChange: (v: string) => void;
  targetWeight: string;
  onTargetWeightChange: (v: string) => void;
  campWeeks: string;
  onCampWeeksChange: (v: string) => void;
  /** One of the weight fields has been typed into and does not parse. */
  showWeightHint: boolean;
  minDate: string;
  maxDate: string;
}

/**
 * Everything needed to describe a camp or an off-season block.
 *
 * This form existed twice — once in the first-run flow and once in the "New
 * Camp" modal — and the copies had already diverged: the modal's fight-date
 * input had no upper bound, so a fighter adding a second camp could pick a date
 * five years out that the generator would clamp without telling them, and the
 * two mode toggles were laid out differently for the same question. One form,
 * two mounts.
 */
export default function CampSetupFields({
  unit,
  offSeasonOnly = false,
  isOffSeason,
  onIsOffSeasonChange,
  offSeasonGoal,
  onOffSeasonGoalChange,
  fightDate,
  onFightDateChange,
  opponent,
  onOpponentChange,
  rounds,
  onRoundsChange,
  roundDuration,
  onRoundDurationChange,
  currentWeight,
  onCurrentWeightChange,
  targetWeight,
  onTargetWeightChange,
  campWeeks,
  onCampWeeksChange,
  showWeightHint,
  minDate,
  maxDate,
}: Props) {
  const accent = isOffSeason ? OFF_SEASON_ACCENT : CAMP_ACCENT;
  const bkfcSelected = rounds === '5' && roundDuration === '2';

  return (
    <div className="flex flex-col gap-5">
      {!offSeasonOnly && (
        <div role="group" aria-label="Training mode" className="grid grid-cols-2 gap-2">
          <ChoiceTile
            selected={!isOffSeason}
            onSelect={() => onIsOffSeasonChange(false)}
            accent={CAMP_ACCENT}
            icon={<Flame size={16} />}
            label="Fight Camp"
          />
          <ChoiceTile
            selected={isOffSeason}
            onSelect={() => onIsOffSeasonChange(true)}
            accent={OFF_SEASON_ACCENT}
            icon={<Dumbbell size={16} />}
            label="Off Season"
          />
        </div>
      )}

      {isOffSeason ? (
        <div>
          <span className="label">Training Goal</span>
          <div role="group" aria-label="Training Goal" className="flex flex-col gap-2">
            {OFF_SEASON_GOALS.map(g => (
              <ChoiceRow
                key={g.value}
                selected={offSeasonGoal === g.value}
                onSelect={() => onOffSeasonGoalChange(g.value)}
                accent={OFF_SEASON_ACCENT}
                title={g.label}
                description={g.desc}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <label className="block">
            <span className="label">Fight Date *</span>
            <input
              className="input"
              type="date"
              min={minDate}
              max={maxDate}
              value={fightDate}
              onChange={e => onFightDateChange(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="label">Opponent (Optional)</span>
            <input
              className="input"
              placeholder="Opponent's name"
              value={opponent}
              onChange={e => onOpponentChange(e.target.value)}
            />
          </label>

          {/* A preset, not a rule set: it fills in the two selects below, which
              stay editable. Crimson because bare-knuckle is the app's most
              damaging format, not because the row is a warning. */}
          <ChoiceRow
            selected={bkfcSelected}
            onSelect={() => {
              onRoundsChange('5');
              onRoundDurationChange('2');
            }}
            accent="var(--accent-crimson)"
            icon={<Flame size={16} />}
            title="BKFC Format"
            description="5 rounds · 2 min · 1 min rest — bare knuckle rules"
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Rounds</span>
              <select className="select" value={rounds} onChange={e => onRoundsChange(e.target.value)}>
                {[3, 4, 5, 6, 8, 10, 12, 15].map(n => (
                  <option key={n} value={n}>{n} rounds</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Round Duration</span>
              <select
                className="select"
                value={roundDuration}
                onChange={e => onRoundDurationChange(e.target.value)}
              >
                <option value="2">2 minutes</option>
                <option value="3">3 minutes</option>
                <option value="5">5 minutes</option>
              </select>
            </label>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Current Weight ({unit}){!isOffSeason && ' *'}</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder={isOffSeason ? 'optional' : 'e.g. 160'}
            value={currentWeight}
            onChange={e => onCurrentWeightChange(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">
            {isOffSeason ? `Goal Weight (${unit})` : `Target Weight (${unit}) *`}
          </span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder={isOffSeason ? 'optional' : 'e.g. 155'}
            value={targetWeight}
            onChange={e => onTargetWeightChange(e.target.value)}
          />
        </label>
      </div>

      {showWeightHint && (
        <p className="-mt-3 text-xs" role="alert" style={{ color: 'var(--accent-crimson)' }}>
          {weightRangeHint(unit)}
        </p>
      )}

      {/* Off-season blocks are always 12 weeks, so there is nothing to choose. */}
      {!isOffSeason && (
        <div>
          <span className="label">Camp Length</span>
          <div role="group" aria-label="Camp Length" className="grid grid-cols-3 gap-2">
            {['6', '8', '10'].map(w => (
              <ChoiceTile
                key={w}
                selected={campWeeks === w}
                onSelect={() => onCampWeeksChange(w)}
                accent={accent}
                label={`${w} Weeks`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
