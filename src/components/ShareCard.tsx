import { useEffect, useRef, useState } from 'react';
import { X, Share2, Download } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import type { WorkoutLog, FightCamp, FighterProfile } from '../types';

/** A shareable win that isn't a training session — belt, streak, PR, fight. */
export interface MilestoneShare {
  /** Big center line, e.g. "BLUE BELT", "14-DAY STREAK", "VICTORY". */
  title: string;
  /** Supporting line, e.g. "New rank earned" or "UD · R3 · vs J. Smith". */
  subtitle: string;
  /** Large celebratory glyph drawn above the title. */
  emoji: string;
  /** File-name stem for the exported PNG, e.g. "belt-blue". */
  slug: string;
}

export type ShareContent =
  | { kind: 'session'; log: WorkoutLog; camp: FightCamp }
  | { kind: 'milestone'; milestone: MilestoneShare };

interface Props {
  content: ShareContent;
  user: FighterProfile;
  onClose: () => void;
}

// The real site — shared images are the app's only outbound artifact, and the
// previous watermark pointed at a domain the app doesn't own.
const SHARE_DOMAIN = 'fightcamp.netlify.app';

const SESSION_EMOJIS: Record<string, string> = {
  conditioning: '🔥',
  skill: '🥊',
  sparring: '⚡',
  strength: '💪',
  recovery: '🧘',
  rest: '😴',
};

const SESSION_LABELS: Record<string, string> = {
  conditioning: 'Conditioning',
  skill: 'Skill Work',
  sparring: 'Sparring',
  strength: 'Strength',
  recovery: 'Recovery',
  rest: 'Rest',
};

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function buildCard(log: WorkoutLog, camp: FightCamp, user: FighterProfile): HTMLCanvasElement {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0a0a');
  bg.addColorStop(1, '#111827');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle top accent line
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(0, 0, W, 8);

  const cx = W / 2;

  // FIGHT CAMP brand
  ctx.fillStyle = '#ea580c';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.15em';
  ctx.fillText('FIGHT CAMP', cx, 140);

  // Athlete name
  ctx.fillStyle = '#6b7280';
  ctx.font = '40px system-ui, sans-serif';
  ctx.fillText(user.name.toUpperCase(), cx, 210);

  // Camp day calculation
  const campStart = parseISO(camp.startDate);
  const logDate = parseISO(log.date);
  const dayNum = Math.max(1, differenceInDays(logDate, campStart) + 1);
  const totalDays = camp.campWeeks * 7;
  const daysToFight = camp.fightDate
    ? Math.max(0, differenceInDays(parseISO(camp.fightDate), new Date()))
    : 0;

  // Big day number
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 320px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(String(dayNum), cx, 680);

  ctx.fillStyle = '#9ca3af';
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.fillText(`of ${totalDays} days`, cx, 770);

  // Progress bar
  const barX = 120, barY = 820, barW = W - 240, barH = 20;
  const progress = Math.min(1, dayNum / totalDays);
  ctx.fillStyle = '#1f2937';
  drawRoundRect(ctx, barX, barY, barW, barH, 10);
  ctx.fill();
  ctx.fillStyle = '#ea580c';
  drawRoundRect(ctx, barX, barY, Math.max(barH, barW * progress), barH, 10);
  ctx.fill();

  // Session card
  const cardX = 80, cardY = 890, cardW = W - 160, cardH = 420;
  ctx.fillStyle = '#1a1a1a';
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, 40);
  ctx.fill();
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 2;
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, 40);
  ctx.stroke();

  // Session type badge
  const emoji = SESSION_EMOJIS[log.sessionType] ?? '🏋️';
  const typeLabel = SESSION_LABELS[log.sessionType] ?? log.sessionType;
  ctx.fillStyle = '#ea580c22';
  drawRoundRect(ctx, cx - 160, cardY + 50, 320, 80, 40);
  ctx.fill();
  ctx.fillStyle = '#ea580c';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${emoji}  ${typeLabel.toUpperCase()}`, cx, cardY + 103);

  // Session title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  // Truncate long titles
  const title = log.title.length > 18 ? log.title.slice(0, 17) + '…' : log.title;
  ctx.fillText(title, cx, cardY + 225);

  // Stats row
  ctx.fillStyle = '#9ca3af';
  ctx.font = '48px system-ui, sans-serif';
  ctx.fillText(`${log.duration} min  ·  RPE ${log.rpe}/10`, cx, cardY + 320);

  // Date
  ctx.fillStyle = '#4b5563';
  ctx.font = '36px system-ui, sans-serif';
  ctx.fillText(format(logDate, 'MMMM d, yyyy').toUpperCase(), cx, cardY + 390);

  // Opponent / fight info — off-season blocks have no fight date, and
  // format(Invalid Date) throws, which killed the share card entirely.
  const fightDate = camp.fightDate ? format(parseISO(camp.fightDate), 'MMM d, yyyy') : null;
  const fightLabel = fightDate
    ? (camp.opponent ? `vs. ${camp.opponent}  ·  ${fightDate}` : `Fight Date: ${fightDate}`)
    : 'Off-Season Training Block';

  ctx.fillStyle = '#6b7280';
  ctx.font = '42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(fightLabel, cx, 1430);

  // Days to fight countdown
  if (daysToFight > 0) {
    ctx.fillStyle = daysToFight < 14 ? '#ef4444' : daysToFight < 28 ? '#f97316' : '#22c55e';
    ctx.font = 'bold 56px system-ui, sans-serif';
    ctx.fillText(`${daysToFight} days to fight`, cx, 1510);
  }

  // Bottom brand watermark
  ctx.fillStyle = '#374151';
  ctx.font = '36px system-ui, sans-serif';
  ctx.fillText(SHARE_DOMAIN, cx, H - 80);

  return canvas;
}

function buildMilestoneCard(m: MilestoneShare, user: FighterProfile): HTMLCanvasElement {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Same visual system as the session card: dark gradient, brand accent line.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0a0a');
  bg.addColorStop(1, '#111827');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#ea580c';
  ctx.fillRect(0, 0, W, 8);

  const cx = W / 2;

  ctx.fillStyle = '#ea580c';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.15em';
  ctx.fillText('FIGHT CAMP', cx, 140);

  ctx.fillStyle = '#6b7280';
  ctx.font = '40px system-ui, sans-serif';
  ctx.fillText(user.name.toUpperCase(), cx, 210);

  // Soft radial glow behind the emoji so the moment reads celebratory even in
  // a feed thumbnail.
  const glow = ctx.createRadialGradient(cx, 700, 60, cx, 700, 460);
  glow.addColorStop(0, '#ea580c33');
  glow.addColorStop(1, '#ea580c00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 240, W, 920);

  ctx.font = '340px system-ui, sans-serif';
  ctx.fillText(m.emoji, cx, 830);

  // Headline, shrunk to fit long titles ("NEW PR: MOST SPARRING ROUNDS").
  let size = 130;
  ctx.fillStyle = '#ffffff';
  do {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    size -= 8;
  } while (ctx.measureText(m.title).width > W - 140 && size > 56);
  ctx.fillText(m.title, cx, 1080);

  ctx.fillStyle = '#9ca3af';
  ctx.font = '52px system-ui, sans-serif';
  ctx.fillText(m.subtitle, cx, 1180);

  ctx.fillStyle = '#4b5563';
  ctx.font = '36px system-ui, sans-serif';
  ctx.fillText(format(new Date(), 'MMMM d, yyyy').toUpperCase(), cx, 1290);

  ctx.fillStyle = '#374151';
  ctx.font = '36px system-ui, sans-serif';
  ctx.fillText(SHARE_DOMAIN, cx, H - 80);

  return canvas;
}

export default function ShareCard({ content, user, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const fileName =
    content.kind === 'session' ? 'fight-camp-session.png' : `fight-camp-${content.milestone.slug}.png`;
  const shareTitle =
    content.kind === 'session'
      ? `Day ${Math.max(1, differenceInDays(parseISO(content.log.date), parseISO(content.camp.startDate)) + 1)} — ${content.log.title}`
      : content.milestone.title;

  useEffect(() => {
    const canvas =
      content.kind === 'session'
        ? buildCard(content.log, content.camp, user)
        : buildMilestoneCard(content.milestone, user);
    canvasRef.current = canvas;
    // Async on purpose (toBlob's callback, not a sync toDataURL) so the state
    // update can't cascade into the same render pass; the object URL is also
    // far lighter than a multi-MB base64 data URL for a 1080×1920 PNG.
    let url: string | null = null;
    let cancelled = false;
    canvas.toBlob(blob => {
      if (!blob || cancelled) return;
      url = URL.createObjectURL(blob);
      setDataUrl(url);
    }, 'image/png');
    return () => {
      cancelled = true;
      // Revoking after replacement/unmount is safe: an <img> that already
      // loaded the URL keeps its pixels; only new loads are prevented.
      if (url) URL.revokeObjectURL(url);
    };
  }, [content, user]);

  async function handleShare() {
    if (!canvasRef.current) return;
    setSharing(true);
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: shareTitle });
        } else {
          // Fallback: download
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(a.href);
        }
        setSharing(false);
      }, 'image/png');
    } catch {
      setSharing(false);
    }
  }

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
      <div className="bg-dark-800 rounded-2xl border border-dark-500 w-full max-w-sm flex flex-col gap-4 p-5" style={{ maxHeight: 'calc(100dvh - 2rem)' }}>
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <p className="text-sm font-semibold text-white">
            {content.kind === 'session' ? 'Share Session' : 'Share the Win'}
          </p>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Share card preview"
            className="rounded-xl border border-dark-500 mx-auto flex-1 min-h-0 object-contain"
            style={{ maxHeight: '60dvh', width: 'auto' }}
          />
        ) : (
          <div className="flex-1 min-h-0 bg-dark-700 rounded-xl flex items-center justify-center" style={{ maxHeight: '60dvh' }}>
            <p className="text-gray-500 text-sm">Generating…</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={handleShare}
            disabled={!dataUrl || sharing}
            className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-sm disabled:opacity-50"
          >
            <Share2 size={16} />
            {sharing ? 'Sharing…' : 'Share'}
          </button>
          <button
            onClick={handleDownload}
            disabled={!dataUrl}
            className="btn-secondary px-4 flex items-center justify-center disabled:opacity-50"
          >
            <Download size={16} />
          </button>
        </div>

        <button onClick={onClose} className="text-center text-xs text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0">
          Skip
        </button>
      </div>
    </div>
  );
}
