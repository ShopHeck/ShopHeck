/**
 * The outbound link that rides along with every shared card.
 *
 * A share image is the app's only outbound artifact, so it is also the only
 * place a new user can come from — and an image alone is a dead end. Two
 * carriers, because either one can be dropped by the surface the card lands
 * on: the link is attached to the share payload as text (chats, mail, posts
 * keep it) *and* drawn into the pixels (a Story, or a screenshot forwarded on,
 * keeps only what's in the image).
 *
 * It points at the App Store listing rather than the PWA host: the shipped iOS
 * app is what a fighter is being invited to install, and the store page is the
 * one destination that survives being forwarded to someone who has never heard
 * of Fight Camp. The PWA is still served from `fightcamp.netlify.app`, which
 * remains the marketing, privacy and support host (`docs/app-store-listing.md`)
 * — it is simply no longer what a shared card advertises.
 */
export const APP_SHARE_URL = 'https://apps.apple.com/us/app/fight-camp-training/id6767876080';

/** Where that link goes, for UI that says so before it's tapped. */
export const APP_SHARE_DOMAIN = 'apps.apple.com';

/**
 * The line drawn into a shared image.
 *
 * Deliberately not the URL: pixels aren't tappable, so the only thing a
 * recipient can do with drawn text is read it and act on it. `id6767876080` is
 * not something anyone retypes, where "the App Store" is an instruction that
 * lands on any device holding the screenshot.
 */
export const APP_SHARE_CTA = 'Download on the App Store';

/**
 * Caption for the share sheet: what was achieved, then where to get the app.
 *
 * The blank line matters — targets that render a preview (Messages, Slack,
 * WhatsApp) split the caption from the URL, so the achievement reads as the
 * message and the link as an invitation rather than one run-on sentence.
 */
export function buildShareMessage(headline: string, detail?: string): string {
  const lead = [headline?.trim(), detail?.trim()].filter(Boolean).join('\n');
  const invite = `Tracked with Fight Camp — get the app: ${APP_SHARE_URL}`;
  return lead ? `${lead}\n\n${invite}` : invite;
}
