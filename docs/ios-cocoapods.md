# iOS CocoaPods vs Bundler

## The short version

```bash
# From repo root
npm run build && npx cap sync ios
cd ios/App
pod install          # Homebrew CocoaPods — NOT bundle exec
```

Do **not** run `bundle exec pod install` in this repository.

## Why

| Tool | Where it lives | Used for |
|---|---|---|
| **CocoaPods** (`pod`) | Homebrew: `/opt/homebrew/bin/pod` with its own isolated gem env | Capacitor iOS native dependencies in `ios/App/Podfile` |
| **Bundler** (`bundle`) | `ios/Gemfile` declares **only** `fastlane` | Fastlane lanes (certs, beta, TestFlight) |

`ios/Gemfile` does not declare `cocoapods`. Invoking `bundle exec pod install` tries to resolve Fastlane’s gem graph and fails with `Bundler::GemNotFound` before CocoaPods runs — even when `pod` itself is installed and healthy.

CI already does the right thing (see `.github/workflows/ios.yml`):

```yaml
- run: pod install
  working-directory: ios/App
```

## Ruby version traps

This machine may have both:

- Apple Ruby 2.6 + system Bundler 1.17 (`/usr/bin/ruby`)
- Homebrew Ruby 4.x + Bundler 4.x (`/opt/homebrew/opt/ruby/bin/ruby`)

Mixing them (`bundle install` under one Ruby, `bundle exec` under another) is a second failure mode. Prefer:

- `pod` from Homebrew for pods
- `bundle exec fastlane …` only after `cd ios && bundle install` with a single consistent Ruby (the one CI’s `ruby/setup-ruby` uses)

## Verify

```bash
cd ios/App
pod --version
cmp -s Podfile.lock Pods/Manifest.lock && echo LOCKS_MATCH
```
