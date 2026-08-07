/**
 * Phone-side filter for WatchConnectivity commands.
 *
 * Commands travel via transferUserInfo, which is queued and can arrive long
 * after the fighter finished a different session. Without identity + sequence
 * + freshness checks, a late "start" or "reset" would operate on the wrong
 * timer. The native bridge and any future JS listener share these rules.
 */

export interface WatchCommandPayload {
  command: 'start' | 'pause' | 'reset' | string;
  /** Session this command belongs to (phone-minted or wrist-minted UUID). */
  sessionId?: string;
  /** Monotonic per-session counter; duplicates and regressions are dropped. */
  seq?: number;
  /** Epoch ms when the wrist issued the command. */
  createdAtMs?: number;
}

export interface WatchCommandContext {
  /** Last session the phone considers live; null before any command/session. */
  activeSessionId: string | null;
  /** Highest seq already accepted for activeSessionId (0 if none). */
  lastSeq: number;
  nowMs: number;
  /** Max age of a command payload. Default 30s. */
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 30_000;

/**
 * Whether a watch command should be applied on the phone.
 *
 * Missing identity metadata is rejected once we have an active session, and
 * also rejected when establishing a session — without a sessionId there is no
 * way to drop a late replay of the same transferUserInfo later.
 */
export function shouldAcceptWatchCommand(
  cmd: WatchCommandPayload,
  ctx: WatchCommandContext,
): boolean {
  const sessionId = typeof cmd.sessionId === 'string' ? cmd.sessionId.trim() : '';
  const seq = typeof cmd.seq === 'number' && Number.isFinite(cmd.seq) ? cmd.seq : NaN;
  const createdAtMs = typeof cmd.createdAtMs === 'number' && Number.isFinite(cmd.createdAtMs)
    ? cmd.createdAtMs
    : NaN;

  if (!sessionId || !Number.isFinite(seq) || seq < 1 || !Number.isFinite(createdAtMs)) {
    return false;
  }

  const ttl = ctx.ttlMs ?? DEFAULT_TTL_MS;
  if (ctx.nowMs - createdAtMs > ttl) return false;
  // Clock skew the other way: far-future stamps are also untrustworthy.
  if (createdAtMs - ctx.nowMs > ttl) return false;

  if (ctx.activeSessionId != null && sessionId !== ctx.activeSessionId) {
    return false;
  }

  if (seq <= ctx.lastSeq) return false;

  return true;
}
