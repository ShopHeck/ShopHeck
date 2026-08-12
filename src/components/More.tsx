import { ChevronRight, Pin, Settings as SettingsIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isPro } from '../utils/subscription';
import { tint } from '../utils/designTokens';
import GlassSurface from './shared/GlassSurface';
import ProChip from './shared/ProChip';
import ReorderableList from './shared/ReorderableList';
import {
  applyOrder, effectiveIds, itemsFor, move, resolvePinned, togglePin,
  type HomeItem, type HomeItemKind, type HomeMode,
} from '../utils/homeLayout';
import type { View } from '../types';

interface Props {
  onNavigate: (view: View) => void;
}

/** The chip + title + subtitle every row shares, pinned or not. */
function RowBody({ item, gated }: { item: HomeItem; gated: boolean }) {
  const Icon = item.icon;
  return (
    <>
      <div
        className="w-10 h-10 flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: tint(item.accent, 0.16),
          borderRadius: 'var(--radius-sm)',
          color: item.accent,
        }}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white leading-tight">{item.title}</p>
        <p className="text-xs leading-tight mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {item.subtitle}
        </p>
      </div>
      {gated && <ProChip />}
    </>
  );
}

/**
 * One row: the item, then its pin toggle.
 *
 * Two sibling buttons, never nested — a control inside a control is invalid,
 * and assistive tech announces only the outer one, which is exactly how the
 * old collapsed progress widget became unreachable.
 */
function ItemRow({
  item, pinned, gated, canPin, reserveHandle, onOpen, onTogglePin,
}: {
  item: HomeItem;
  pinned: boolean;
  gated: boolean;
  canPin: boolean;
  /**
   * Hold open the column the drag handle occupies on pinned rows.
   *
   * Only pinned rows carry a handle, so without this the two runs in a group
   * end at different x — the pinned ones a handle's width shorter — and the
   * list reads as misaligned rather than as grouped.
   */
  reserveHandle?: boolean;
  onOpen?: () => void;
  onTogglePin?: () => void;
}) {
  return (
    <div className="flex items-stretch gap-2">
      {onOpen ? (
        <GlassSurface
          as="button"
          cornerRadius="md"
          onClick={onOpen}
          className="flex items-center gap-3 text-left p-3 flex-1 min-w-0"
        >
          <RowBody item={item} gated={gated} />
          <ChevronRight size={16} className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        </GlassSurface>
      ) : (
        <GlassSurface cornerRadius="md" className="flex items-center gap-3 p-3 flex-1 min-w-0">
          <RowBody item={item} gated={gated} />
        </GlassSurface>
      )}

      {canPin && onTogglePin && (
        <button
          onClick={onTogglePin}
          aria-pressed={pinned}
          aria-label={`${pinned ? 'Unpin' : 'Pin'} ${item.title} ${pinned ? 'from' : 'to'} Home`}
          className="flex items-center justify-center w-11 flex-shrink-0 rounded-xl transition-colors"
          style={{
            color: pinned ? 'var(--accent-teal)' : 'var(--text-tertiary)',
            background: pinned ? tint('var(--accent-teal)', 0.12) : 'transparent',
          }}
        >
          <Pin size={17} fill={pinned ? 'currentColor' : 'none'} />
        </button>
      )}

      {reserveHandle && <div className="w-11 flex-shrink-0" aria-hidden="true" />}
    </div>
  );
}

/**
 * The More tab — every tool in the app, and the switch for what sits on Home.
 *
 * Tools used to be scattered across three places: a fixed grid at the bottom of
 * each Home, a list inside Settings called "Integrations", and a few screens
 * reachable only by tapping a card that happened to link to them. They are all
 * here now, from one registry, and the pin toggle is what decides which of them
 * are also on Home.
 *
 * Pinned items float to the top of their own group rather than being repeated
 * in a separate "pinned" list above the full one — listing the same tool twice
 * on one screen is the exact duplication this whole change set out to remove.
 * Only the pinned run carries drag handles, because order means nothing for an
 * item that is not on Home.
 */
export default function More({ onNavigate }: Props) {
  const { state, dispatch } = useApp();
  const prefs = state.dashboardPrefs;
  const pro = isPro(state.subscription);

  const isCoach = state.currentUser?.role === 'coach';
  const mode: HomeMode = isCoach
    ? 'coach'
    : state.activeCamp?.isOffSeason ? 'offseason' : 'camp';

  // Pinning targets a Home that exists. A coach's Home is the team roster, and
  // a fighter with no camp sees the mode chooser — neither renders pinned
  // items, so offering a pin there would be a control that does nothing.
  const canPin = !isCoach && !!state.activeCamp;

  function pinnedOf(kind: HomeItemKind): HomeItem[] {
    return resolvePinned(effectiveIds(prefs, kind, mode), kind, mode);
  }

  function write(kind: HomeItemKind, ids: string[]) {
    dispatch({
      type: 'SET_DASHBOARD_PREF',
      payload: kind === 'card' ? { pinnedCards: ids } : { pinnedTools: ids },
    });
  }

  function onTogglePin(item: HomeItem) {
    write(item.kind, togglePin(effectiveIds(prefs, item.kind, mode), item.id, item.kind, mode));
  }

  function onReorder(kind: HomeItemKind, from: number, to: number) {
    const stored = effectiveIds(prefs, kind, mode);
    const visible = resolvePinned(stored, kind, mode).map(i => i.id);
    write(kind, applyOrder(stored, kind, mode, move(visible, from, to)));
  }

  function rowFor(item: HomeItem, pinned: boolean) {
    return (
      <ItemRow
        item={item}
        pinned={pinned}
        gated={!!item.pro && !pro}
        canPin={canPin}
        // Pinned rows get a real handle from ReorderableList; unpinned rows
        // hold the same column open so both runs end at the same x.
        reserveHandle={canPin && !pinned}
        onOpen={item.view ? () => onNavigate(item.view!) : undefined}
        onTogglePin={() => onTogglePin(item)}
      />
    );
  }

  /**
   * A plain function, not a component. Declaring a component inside render
   * gives it a fresh type on every render, so React remounts the whole subtree
   * — which here would tear down a row mid-tap and reset the drag state on any
   * unrelated dispatch. Lint enforces this (react-hooks/static-components).
   */
  function renderGroup({ kind, title, blurb }: { kind: HomeItemKind; title: string; blurb: string }) {
    const all = itemsFor(kind, mode);
    if (all.length === 0) return null;

    const pinned = canPin ? pinnedOf(kind) : [];
    const pinnedIds = new Set(pinned.map(i => i.id));
    const rest = all.filter(i => !pinnedIds.has(i.id));

    return (
      <div className="mx-4">
        <div className="flex items-baseline justify-between mb-2">
          <p className="type-caption text-gray-450">{title}</p>
          {canPin && (
            <span className="text-xs text-gray-450 tabular-nums">
              {pinned.length} on Home
            </span>
          )}
        </div>
        {canPin && <p className="text-xs text-gray-450 mb-2.5 leading-snug">{blurb}</p>}

        {pinned.length > 0 && (
          <div className="mb-2">
            <ReorderableList
              items={pinned}
              keyOf={i => i.id}
              labelOf={i => i.title}
              onReorder={(from, to) => onReorder(kind, from, to)}
            >
              {item => rowFor(item, true)}
            </ReorderableList>
          </div>
        )}

        <div className="space-y-2">
          {rest.map(item => (
            <div key={item.id}>{rowFor(item, false)}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4 pt-4">
      {renderGroup({
        kind: 'card',
        title: 'Home cards',
        blurb: "Pinned cards stack on Home under your readiness and today's work.",
      })}
      {renderGroup({
        kind: 'tool',
        title: 'Tools',
        blurb: 'Pinned tools become the grid at the bottom of Home.',
      })}

      <div className="mx-4">
        <p className="type-caption text-gray-450 mb-2">App</p>
        <GlassSurface
          as="button"
          cornerRadius="md"
          onClick={() => onNavigate('settings')}
          className="flex items-center gap-3 text-left p-3 w-full"
        >
          <div
            className="w-10 h-10 flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: tint('var(--text-secondary)', 0.14),
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
            }}
          >
            <SettingsIcon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white leading-tight">Settings</p>
            <p className="text-xs leading-tight mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Profile, camps, units, account and sync
            </p>
          </div>
          <ChevronRight size={16} className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        </GlassSurface>
      </div>
    </div>
  );
}
