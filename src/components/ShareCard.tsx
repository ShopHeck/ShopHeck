import { useEffect, useId, useRef, useState } from 'react';
import { X, Share2, Download, Link2, Check, Copy } from 'lucide-react';
import type { WorkoutLog, FightCamp, FighterProfile } from '../types';
import { useDialog } from '../hooks/useDialog';
import {
  campDay,
  drawMilestoneCard,
  drawSessionCard,
  type MilestoneShare,
} from '../utils/shareCardCanvas';
import { APP_SHARE_DOMAIN, APP_SHARE_URL, buildShareMessage } from '../utils/shareLink';

// Re-exported so the call sites that open a card (CelebrationToast,
// FightBreakdown) keep importing the shape from the component they hand it to.
export type { MilestoneShare };

export type ShareContent =
  | { kind: 'session'; log: WorkoutLog; camp: FightCamp }
  | { kind: 'milestone'; milestone: MilestoneShare };

interface Props {
  content: ShareContent;
  user: FighterProfile;
  onClose: () => void;
}

export default function ShareCard({ content, user, onClose }: Props) {
  const titleId = useId();
  const panelRef = useDialog({ onClose });
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const blobRef = useRef<Blob | null>(null);

  const fileName =
    content.kind === 'session' ? 'fight-camp-session.png' : `fight-camp-${content.milestone.slug}.png`;
  // Null for a session logged before the camp's start date, which is a real
  // case — see `campDay`. The caption drops the prefix rather than inventing a
  // day one.
  const day = content.kind === 'session' ? campDay(content.camp, content.log.date) : null;
  const shareTitle =
    content.kind === 'session'
      ? day === null
        ? content.log.title
        : `Day ${day} — ${content.log.title}`
      : content.milestone.title;
  const shareDetail =
    content.kind === 'session'
      ? `${content.log.duration} min · RPE ${content.log.rpe}/10`
      : content.milestone.subtitle;
  const shareText = buildShareMessage(shareTitle, shareDetail);

  useEffect(() => {
    // The generators await their fonts and the brand mark before the first
    // stroke — canvas doesn't participate in CSS font loading, so drawing
    // eagerly would render the card in whatever face happened to be ready.
    //
    // The encode is async too (toBlob's callback, not a sync toDataURL) so the
    // state update can't cascade into the same render pass; the object URL is
    // also far lighter than a multi-MB base64 data URL for a 1080×1920 PNG.
    // The blob is kept so Share and Download reuse this encode.
    let url: string | null = null;
    let cancelled = false;
    const drawing =
      content.kind === 'session'
        ? drawSessionCard(content.log, content.camp, user)
        : drawMilestoneCard(content.milestone, user);
    void drawing.then(canvas => {
      if (cancelled) return;
      canvas.toBlob(blob => {
        if (!blob || cancelled) return;
        blobRef.current = blob;
        url = URL.createObjectURL(blob);
        setDataUrl(url);
      }, 'image/png');
    });
    return () => {
      cancelled = true;
      // The blob is deliberately left in place. `content` is a fresh object on
      // every parent render, so this effect re-runs and would otherwise leave a
      // window where the preview is still on screen (and Share still enabled)
      // with nothing behind the button until the next encode lands.
      //
      // Revoking after replacement/unmount is safe: an <img> that already
      // loaded the URL keeps its pixels; only new loads are prevented.
      if (url) URL.revokeObjectURL(url);
    };
  }, [content, user]);

  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * The share sheet, with the app link attached.
   *
   * Three payloads, tried in order, because support is uneven: some targets
   * take an image with a caption, some take the image only, and a browser
   * without file sharing can still pass along the link. `canShare` is the only
   * reliable way to ask — a payload a platform doesn't support otherwise
   * rejects at `share()` time, after the user has already tapped.
   */
  async function handleShare() {
    const blob = blobRef.current;
    if (!blob) return;
    setSharing(true);
    try {
      const file = new File([blob], fileName, { type: 'image/png' });
      const withCaption = { files: [file], title: shareTitle, text: shareText };
      const imageOnly = { files: [file], title: shareTitle };

      if (navigator.canShare?.(withCaption)) {
        await navigator.share(withCaption);
      } else if (navigator.canShare?.(imageOnly)) {
        await navigator.share(imageOnly);
      } else if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url: APP_SHARE_URL });
      } else {
        downloadBlob(blob);
      }
    } catch (err) {
      // Dismissing the sheet rejects with AbortError. That's a decision, not a
      // failure, and must not trigger the download fallback.
      if ((err as Error | undefined)?.name !== 'AbortError') downloadBlob(blob);
    } finally {
      // Always: an unreset flag leaves the button disabled and reading
      // "Sharing…" for the rest of the sheet's life.
      setSharing(false);
    }
  }

  function handleDownload() {
    if (blobRef.current) downloadBlob(blobRef.current);
  }

  async function handleCopyLink() {
    // Checked rather than optional-chained: `await undefined` resolves, which
    // would tick the button green without anything reaching the clipboard.
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(APP_SHARE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused outside a secure context; the link is
      // visible next to the button either way.
    }
  }

  return (
    // z-[60], the app's dialog layer (ConfirmDialog), not z-50: the bottom nav
    // is also z-50 and comes later in the tree, so it painted over the sheet's
    // Skip button on shorter viewports — and stayed undimmed by the scrim.
    <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-dark-800 rounded-2xl border border-dark-500 w-full max-w-sm flex flex-col gap-3 p-5 outline-none"
        style={{ maxHeight: 'calc(100dvh - 2rem)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <p id={titleId} className="text-sm font-semibold text-white">
            {content.kind === 'session' ? 'Share Session' : 'Share the Win'}
          </p>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white transition-colors w-11 h-11 flex items-center justify-center -m-2">
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Share card preview"
            className="rounded-xl border border-dark-500 mx-auto flex-1 min-h-0 max-w-full object-contain"
            style={{ maxHeight: '52dvh', width: 'auto' }}
          />
        ) : (
          <div className="flex-1 min-h-0 bg-dark-700 rounded-xl flex items-center justify-center" style={{ maxHeight: '52dvh' }}>
            <p className="text-gray-400 text-sm">Generating…</p>
          </div>
        )}

        {/* The link that ships with the card — stated, so it isn't a surprise */}
        <div className="flex-shrink-0 flex items-center gap-2.5 rounded-xl border border-dark-500 bg-dark-700/60 px-3 py-2">
          <Link2 size={15} className="text-brand-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-tight text-gray-400">Shared with a link to the app</p>
            <p className="text-xs text-white truncate">{APP_SHARE_DOMAIN}</p>
          </div>
          <button
            onClick={handleCopyLink}
            aria-label={copied ? 'Link copied' : 'Copy app link'}
            className="text-gray-400 hover:text-white transition-colors w-11 h-11 flex items-center justify-center -my-2 -mr-2 flex-shrink-0"
          >
            {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
          </button>
        </div>

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
            aria-label="Download card"
            className="btn-secondary px-4 flex items-center justify-center disabled:opacity-50"
          >
            <Download size={16} />
          </button>
        </div>

        <button onClick={onClose} className="text-center text-xs text-gray-400 hover:text-gray-300 transition-colors flex-shrink-0">
          Skip
        </button>
      </div>
    </div>
  );
}
