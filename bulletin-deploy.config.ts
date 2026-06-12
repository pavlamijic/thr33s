// Product manifest for thr33s. Without this file, bulletin-deploy only sets a
// "legacy contenthash" on playthrees33.dot — no product manifest, no
// app.playthrees33.dot executable record, no appVersion. First-party Polkadot
// Hosts (Desktop / Mobile / Web) launch + version a product via the on-chain
// product manifest (RFC paritytech/triangle-js-sdks 0001-product-manifest):
//   - root manifest  → playthrees33.dot text-record `manifest` (displayName, icon)
//   - app executable → app.playthrees33.dot text-record `executable` (appVersion + CID)
// Publishing it is parent-authorised text-record / subname writes — it does NOT
// need Proof-of-Personhood (that only gates the optional Publisher registry).
//
// Bump `appVersion` on every release so the host detects the new version and
// refetches. `path` resolves relative to THIS file and MUST match the build dir
// passed to bulletin-deploy (the CI deploy job downloads the build into ./dist),
// so the app executable reuses the already-uploaded CID instead of re-uploading.
//
// `defineConfig` is just an identity helper for editor hints. We define it
// locally (not `import { defineConfig } from "bulletin-deploy"`) because
// bulletin-deploy is only installed globally / via npx at publish time, never in
// the app's node_modules — importing it would throw at config-load. Pattern
// copied from paritytech/t3rminal's bulletin-deploy.config.ts.
const defineConfig = <T>(config: T): T => config;

export default defineConfig({
  domain: 'playthrees33.dot',
  displayName: 'Thr33s',
  description:
    'Web3 Threes — slide and merge tiles, then anchor your score on an on-chain leaderboard. Proof-of-Personhood only.',
  icon: { path: './icon.png', format: 'png' },
  executables: [
    {
      kind: 'app',
      path: './dist',
      appVersion: [0, 1, 6],
    },
  ],
});
