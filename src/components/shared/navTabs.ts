import { LayoutDashboard, Calendar, Dumbbell, Scale, BarChart3, Users, Menu, Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavTab {
  id: string;
  icon: LucideIcon;
  label: string;
}

/**
 * "More" occupies the slot Settings used to.
 *
 * The bar was already at six tabs, so a seventh for More would have dropped
 * every target to roughly 44pt on an iPhone SE and truncated the longest
 * label. It did not need one: Settings and More are the same idea — the drawer
 * for everything that is not the daily work — so Settings became a row inside
 * More rather than a peer of it.
 */
export const COACH_TABS: NavTab[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'fighters', icon: Users, label: 'Fighters' },
  { id: 'progress', icon: BarChart3, label: 'Progress' },
  { id: 'more', icon: Menu, label: 'More' },
];

export const FIGHTER_TABS: NavTab[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
  { id: 'planner', icon: Calendar, label: 'Plan' },
  { id: 'log', icon: Dumbbell, label: 'Log' },
  { id: 'timer', icon: Timer, label: 'Timer' },
  { id: 'weight', icon: Scale, label: 'Weight' },
  { id: 'more', icon: Menu, label: 'More' },
];

export function tabsFor(isCoach: boolean): NavTab[] {
  return isCoach ? COACH_TABS : FIGHTER_TABS;
}

/**
 * The view ids reachable from the tab bar, for the given role.
 *
 * App.tsx needs this to decide whether a navigation is a tab switch (which
 * resets the back stack, the way a native tab bar does) or a push into a
 * detail view (which needs a back button). It lives beside the tab list rather
 * than being restated in App.tsx so the two cannot drift apart — a view
 * silently dropping out of the tab bar without App.tsx noticing is how the
 * off-tab views lost their only exit.
 */
export function tabViewIds(isCoach: boolean): string[] {
  return tabsFor(isCoach).map(t => t.id);
}
