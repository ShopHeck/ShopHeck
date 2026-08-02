// Display prices for the two tiers — the single source for every surface that
// quotes a price (paywall, onboarding offer). Billing itself is configured in
// Stripe / App Store Connect; keep these strings in sync with those products.
export const PRICES = {
  fighter: { monthly: '$7.99', annual: '$59.99', annualMonthly: '$5.00', saving: '37%' },
  coach:   { monthly: '$19.99', annual: '$149.99', annualMonthly: '$12.50', saving: '37%' },
} as const;
