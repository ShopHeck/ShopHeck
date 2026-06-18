# iOS Code Signing

The TestFlight pipeline (`.github/workflows/ios.yml` → `ios/fastlane/Fastfile`)
supports two signing strategies and **picks automatically based on env**:

| Mode | When | Behaviour |
|------|------|-----------|
| **Automatic** (default) | no `MATCH_*` secrets | Xcode creates/downloads the cert + profile per run via `-allowProvisioningUpdates`. Zero setup, but mints a **new certificate on each fresh CI machine** — a busy CI eventually hits Apple's certificate cap (`"Your account has reached the maximum number of certificates"`). |
| **Shared (fastlane match)** | `MATCH_*` secrets set | One distribution cert + profile, stored encrypted in a private repo and **reused by every build**. No certificate churn. |

If you ever hit the cert cap on automatic signing: revoke the surplus
**Apple Development / Distribution** certs at
<https://developer.apple.com/account/resources/certificates/list>, then re-run.

## Switching to fastlane match (recommended, one-time setup)

1. **Create a private repo** for the encrypted certs, e.g. `your-org/fightcamp-ios-certs`.
   It must be **private** — never the public app repo.
2. **Create a fine-grained Personal Access Token** (or deploy key) with
   read/write to that repo. Base64-encode `x-access-token:<TOKEN>`:
   ```bash
   echo -n "x-access-token:ghp_xxx" | base64
   ```
3. **Add these GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions):
   - `MATCH_GIT_URL` — `https://github.com/your-org/fightcamp-ios-certs.git`
   - `MATCH_PASSWORD` — a passphrase you choose (encrypts the stored certs)
   - `MATCH_GIT_BASIC_AUTHORIZATION` — the base64 string from step 2
4. **Bootstrap the cert** (one time): GitHub → Actions → *iOS Build → TestFlight*
   → **Run workflow** → set **lane = `certs`**. This creates the distribution
   cert + App Store profile and stores them encrypted in the certs repo.
   *(Revoke any leftover certs first if you're at the cap.)*
5. Done. Every normal build now runs `match` read-only and reuses that one cert.
   To rotate/refresh later, run the `certs` lane again.

Until step 3 is complete the pipeline stays on automatic signing, so nothing breaks.
