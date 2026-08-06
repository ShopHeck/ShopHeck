# iOS Code Signing

The TestFlight pipeline (`.github/workflows/ios.yml` → `ios/fastlane/Fastfile`)
supports two signing strategies and **picks automatically based on env**:

| Mode | When | Behaviour |
|------|------|-----------|
| **Automatic** (default) | no `MATCH_*` secrets | Xcode creates/downloads the cert + profile per run via `-allowProvisioningUpdates`. Zero setup, but archives under automatic signing **must** sign with a development identity, so each fresh CI machine mints a **new development certificate** — a busy CI eventually hits Apple's certificate cap (`"Your account has reached the maximum number of certificates"`). This is inherent to automatic signing on ephemeral runners (forcing `Apple Distribution` under automatic signing is rejected as "conflicting provisioning settings") — the only cure is periodic cert cleanup, or switching to match. |
| **Shared (fastlane match)** | `MATCH_*` secrets set | One distribution cert + profile, stored encrypted in a private repo and **reused by every build**. The lane flips the Release config to manual signing with that cert, so no development certs are created at all. No certificate churn. |

**If the CI build currently fails with `"Choose a certificate to revoke. Your
account has reached the maximum number of certificates"` / `"No profiles for
'app.fightcamptraining' were found"`**: the Apple Developer account is at the
certificate cap, and no code change can clear that. Revoke the surplus
**Apple Development** certs (one was created per past CI run) at
<https://developer.apple.com/account/resources/certificates/list>, then re-run
the workflow. Revoking a development cert does not affect the shipped app.

## Switching to fastlane match (recommended, one-time setup)

1. **Create a private repo** for the encrypted certs, e.g. `your-org/fightcamp-ios-certs`.
   It must be **private** — never the public app repo.
2. **Generate a deploy key** for that repo (no passphrase — CI cannot type one):
   ```bash
   ssh-keygen -t ed25519 -N "" -C "fightcamp-ios-certs deploy key" -f ~/.ssh/fightcamp_certs
   ```
   Add the **public** half (`~/.ssh/fightcamp_certs.pub`) at
   *certs repo → Settings → Deploy keys → Add deploy key*, and tick
   **Allow write access** — the `certs` lane pushes to it.
3. **Add these GitHub Actions secrets** on the **app** repo
   (Settings → Secrets and variables → Actions → *Repository secrets*):
   - `MATCH_GIT_URL` — `git@github.com:your-org/fightcamp-ios-certs.git` (SSH, not HTTPS)
   - `MATCH_PASSWORD` — a passphrase you choose (encrypts the stored certs)
   - `MATCH_DEPLOY_KEY` — the **private** half (`cat ~/.ssh/fightcamp_certs`),
     pasted whole including the `-----BEGIN`/`-----END` lines
4. **Bootstrap the cert** (one time): GitHub → Actions → *iOS Build → TestFlight*
   → **Run workflow** → set **lane = `certs`**. This creates the distribution
   cert + App Store profile and stores them encrypted in the certs repo.
   *(Revoke any leftover certs first if you're at the cap.)*
5. Done. Every normal build now runs `match` read-only and reuses that one cert.
   To rotate/refresh later, run the `certs` lane again.

Until step 3 is complete the pipeline stays on automatic signing, so nothing breaks.

## Adding an app extension

An embedded extension is a **separate signed bundle** with its own App ID and
its own provisioning profile — none of it is inherited from the host app. The
Live Activity widget (`TimerLiveActivity`, bundle
`app.fightcamptraining.timerliveactivity`) is one; anything added later will be
too.

Everything signing-related is driven off one list, `SIGNED_BUNDLES` at the top
of `ios/fastlane/Fastfile`. **Add a row when you add an extension target** — its
Xcode target name, bundle identifier, and a display name for the Developer
Portal entry — and the lanes pick it up everywhere: App ID registration, match
profiles, per-target manual signing, and gym's export options.

Omitting it fails the archive with

```
No profiles for 'app.fightcamptraining.timerliveactivity' were found ...
(in target 'TimerLiveActivity' from project 'App')
```

which lands *after* the app target has signed cleanly, so it reads like an
app-level signing fault rather than a missing extension profile.

The first build after a new row runs `match` read-only, finds no stored profile
for the new bundle, and provisions it: it registers the App ID (if needed) and
generates and pushes just the missing profile. The shared certificate is reused,
never reissued, so this cannot contribute to the certificate cap. Running the
`certs` lane by hand does the same thing up front.

## Entitlements and capabilities

An entitlement in a target's `.entitlements` file is only half of the
arrangement. The other half is a **capability on the App ID**, and Apple writes
an App ID's capabilities into a provisioning profile at the moment the profile
is cut — so a profile issued before a capability was enabled never gains it, no
matter how many times it is downloaded. Xcode compares the two at archive time:

```
Provisioning profile "match AppStore app.fightcamptraining.watchkitapp"
doesn't include the com.apple.developer.healthkit and
com.apple.developer.healthkit.access entitlements.
(in target 'FightCampWatch' from project 'App')
```

That lands ~20 minutes into a macOS run and names neither the App ID nor the
stale profile, which are the two things actually wrong. Both halves are now
handled automatically, on every archive:

- **`sync_app_capabilities`** reads each signed target's `CODE_SIGN_ENTITLEMENTS`
  plist out of the Xcode project, maps each key through `ENTITLEMENT_CAPABILITIES`
  in the Fastfile, and enables anything the App ID is missing.
- **`renew_stale_profiles`** then parses the profile match installed for each
  bundle and re-issues any that does not carry the entitlements its target
  ships. That covers a capability enabled a moment earlier *and* one enabled by
  hand in the portal — neither reaches back into a profile already in storage.
  Only the profile is re-cut; the shared certificate is reused, so this cannot
  contribute to the certificate cap either. Both the archive
  (`sync_match_profiles`) and the `certs` bootstrap lane run it.

  match does repair some of this itself, but only when it is *not* read-only: a
  non-read-only run asks the portal whether each stored profile is still valid,
  and enabling a capability invalidates that App ID's profiles. Every archive
  runs read-only, which skips the question — and "Apple marked it invalid" and
  "it carries the entitlements this target ships" are different claims anyway.
  Only the second is what the archive checks, so that is what gets checked here.

**Adding an entitlement is one edit**: put it in the target's `.entitlements`
file. If `ENTITLEMENT_CAPABILITIES` has no row for the key, the build stops
immediately and tells you to add one, rather than archiving for twenty minutes
and failing at signing. Use `capability: nil` for an entitlement Apple grants
without a capability of its own.

If a re-cut profile *still* lacks the entitlement, the capability did not take
on the App ID — a few cannot be set through the App Store Connect API and have
to be ticked once by hand under Identifiers in the Developer Portal. The lane
says so by name and stops before the archive.

### Three things Apple checks that signing does not

All of these reject the **upload**, minutes after a green archive:

- **`CFBundleDisplayName`** is required on an extension (`90360`). Set it as
  `INFOPLIST_KEY_CFBundleDisplayName` in the target's build settings — the
  extension uses `GENERATE_INFOPLIST_FILE = YES`, so that is the key that
  actually reaches the built bundle.
- **Version numbers must match the containing app exactly** (`90057`).
  `increment_build_number` shells out to `agvtool new-version -all`, and `-all`
  only reaches targets whose `VERSIONING_SYSTEM` is `apple-generic` — the App
  target's is, a stock extension target's is not. `sync_extension_versions` in
  the Fastfile copies the app's `CURRENT_PROJECT_VERSION` and
  `MARKETING_VERSION` onto every other target before the archive, so a new
  extension is covered without needing to remember this.
- **Every purpose string an entitlement implies must be present, in the bundle
  that carries the entitlement** (`90683`). The check is on the entitlement, not
  on what the code calls: a bundle with `com.apple.developer.healthkit` needs
  *both* `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription`
  even if it only ever reads. The watch app shipped with just the share string —
  correct about its own behaviour, wrong about the rule — and the upload was
  rejected with "The Info.plist file for the `App.app/Watch/FightCampWatch.app`
  bundle should contain a NSHealthUpdateUsageDescription key". Apple's own error
  text spells the rule out: *"While your app might not use these APIs, a purpose
  string is still required."*

  Note this is per embedded bundle. The host app had both strings all along,
  which is why it passed and the watch did not. A new bundle inherits neither
  the entitlements nor the purpose strings of its host.

### Why a deploy key rather than a token

A personal access token works, but it expires. When it lapses the build fails at
the match clone with `remote: invalid credentials` — which reads like a
permissions problem and sends you auditing repo access that was never wrong.
Deploy keys do not expire, are scoped to the one repo instead of your whole
account, and can be revoked without disturbing anything else.

If you do use a token instead, put it in `MATCH_GIT_BASIC_AUTHORIZATION` as
base64 of `x-access-token:<TOKEN>` and generate it with **no line wrapping**:

```bash
printf '%s' "x-access-token:github_pat_xxx" | base64 | tr -d '\n'
```

`base64` wraps at 76 columns by default, and a newline inside an HTTP header
makes the request malformed — GitHub answers **400** rather than anything that
names the cause. `sanitize_match_env!` in the Fastfile strips whitespace to
defend against this, and deletes the variable entirely when it is blank so match
cannot send an empty `Authorization: Basic ` header that overrides other
credentials.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `remote: invalid credentials` | Expired token, or an empty `MATCH_GIT_BASIC_AUTHORIZATION` overriding the URL's credentials |
| `The requested URL returned error: 400` | Newline inside the base64 auth value |
| `Permission denied (publickey)` | Deploy key missing, or `MATCH_GIT_URL` still on `https://` instead of `git@github.com:` |
| `remote: Write access to repository not granted` | Deploy key added without **Allow write access** |
| Archive hangs with no output | Missing `setup_ci` — codesign blocks on a locked login keychain (already fixed in the Fastfile) |
| `No profiles for 'app.fightcamptraining.<something>' were found` naming an extension target | That bundle is missing from `SIGNED_BUNDLES` in the Fastfile — see *Adding an app extension* above |
