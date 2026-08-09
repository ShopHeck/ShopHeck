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
 * The domain is the live PWA, which is both the install page and the App Store
 * signpost — see `docs/app-store-listing.md`, where the same host serves the
 * marketing, privacy and support URLs.
 */
export const APP_SHARE_DOMAIN = 'fightcamp.netlify.app';
export const APP_SHARE_URL = `https://${APP_SHARE_DOMAIN}`;

/** Kicker printed above the link on the card. */
export const APP_SHARE_CTA = 'TRAIN WITH ME';

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
