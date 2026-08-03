# Troubleshooting sign-in and purchases

Both features depend on credentials that are **baked into the binary at build
time** — the Supabase URL/anon key are inlined by Vite, and the RevenueCat key is
substituted into `Info.plist` from a build setting. Nothing is read at runtime,
so a wrong value can't be corrected from the device or the dashboard: it needs a
new build.

That's what makes these two failures confusing. They look like network problems
and they are not.

## Start here: Settings → App → Connection diagnostics

On any build, this shows what the app is actually configured to talk to:

- which Supabase project (host only), and whether it answers right now
- which *kind* of RevenueCat key shipped (`appl_`, `test_`, `goog_`, `none`, …)
- whether an offering can currently be fetched

"Copy report" puts the whole thing on the clipboard. A row that mentions the
build, an API key, or a project URL can only be fixed by shipping a new build.

## "Load failed" on sign-in

`Load failed` is WKWebView's wording for a fetch that never got a response —
the request didn't reach Supabase at all. It is **not** a wrong password (that
comes back as "Invalid login credentials") and it is **not** a server error
(that would come back with an HTTP status).

Causes, in order of likelihood:

1. **`VITE_SUPABASE_URL` is wrong in the build.** A typo'd project ref fails at
   DNS. Check Settings → Secrets and variables → Actions and compare the host
   against Supabase → Project Settings → Data API.
2. **The secret has surrounding whitespace or quotes.** `"https://x.supabase.co"`
   and a trailing newline both survive into the bundle and produce a URL that
   `fetch` rejects before it hits the network. The app now strips these and the
   CI preflight rejects them, but an already-installed build still carries the
   bad value.
3. **The device genuinely has no route out.** Captive-portal Wi-Fi is the usual
   culprit. Diagnostics distinguishes this: the config row passes and only the
   server row fails.

To confirm from the server side, check whether the attempt arrived at all —
Supabase → Logs → Auth. If a failed sign-in produces no log line, the request
never left the phone.

## "Error 11: There was a credentials issue" when subscribing

This is RevenueCat's `invalidCredentialsError`: its backend answered **401** to
the SDK's key. It always means the key in the build is wrong, never that the
user's payment or Apple ID has a problem.

Public RevenueCat SDK keys are platform-scoped and prefixed. An iOS release
build needs the **`appl_`** key from RevenueCat → Project Settings → API keys →
"Public app-specific Apple API key". These are the keys that get mistaken for it:

| Prefix | What it actually is | Works in an iOS release build? |
|---|---|---|
| `appl_` | Public Apple SDK key | **Yes — this is the one** |
| `test_` | Test Store key | No — debug builds only |
| `goog_` | Google Play SDK key | No |
| `amzn_` | Amazon SDK key | No |
| `rcb_` / `strp_` | Web Billing key | No |
| `sk_` | Secret key (server-side) | No — and never ship it in an app |

Note that `ios/App/App.xcodeproj` carries a `test_…` key in its **Debug**
configuration on purpose. That key is correct for local development and wrong
for anything uploaded to TestFlight — an easy one to copy into the
`REVENUECAT_API_KEY` GitHub secret by mistake.

If the key is right and the paywall still won't open, the app will now say which
of these it is instead:

- *"No subscription options are available"* — no **current** offering is set in
  RevenueCat, or its products aren't Ready to Submit in App Store Connect.
- *"Couldn't reach the App Store"* — genuinely a network problem; retrying works.

## Where the guardrails are

A wrong key or URL used to produce a perfectly successful build that failed only
on a user's phone. Three checks now stop that:

| Check | Where | Catches |
|---|---|---|
| Secret shape preflight | `.github/workflows/ios.yml`, first step | Missing, quoted, or wrong-platform secrets — before ~20 min of macOS build time |
| `validate_revenuecat_key!` | `ios/fastlane/Fastfile` | The same, for local `fastlane beta` runs |
| `RevenueCatConfig.validate` | `ios/App/App/RevenueCatPlugin.swift` | A bad key at launch — the SDK is left unconfigured and purchase entry points explain why, rather than 401ing |

The Swift and Fastlane rules are duplicated deliberately (one runs on a build
machine, one on the device); keep them in step when adding a prefix.

Supabase gets the equivalent treatment in `src/lib/supabase.ts`: values are
trimmed and unquoted, the URL must parse as `https`, the anon key must look like
a JWT or `sb_publishable_…`, and anything else is reported as a named config
error instead of failing later as "Load failed".

## Rotating the secrets

Both live in GitHub → Settings → Secrets and variables → Actions:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase → Project Settings →
  Data API. Paste with no quotes and no trailing newline.
- `REVENUECAT_API_KEY` — the `appl_` key described above.

Then re-run **Actions → iOS Build → TestFlight**. The preflight fails fast if
anything is still wrong.
