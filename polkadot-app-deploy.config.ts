// Product manifest for thr33s. Without this file, polkadot-app-deploy (`pad`) only sets a
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
// passed to pad (the CI deploy job downloads the build into ./dist),
// so the app executable reuses the already-uploaded CID instead of re-uploading.
//
// `defineConfig` is just an identity helper for editor hints. We define it
// locally (not imported from the pad package) because pad is only installed
// globally at publish time, never in the app's node_modules — importing it
// would throw at config-load. Pattern copied from paritytech/t3rminal.
const defineConfig = <T>(config: T): T => config;

export default defineConfig({
  // TLD is per environment: `.paseo` on paseo-next-v2, `.dot` on devnet. The
  // workflow sets PAD_ENV (which pad also reads as its --env default).
  domain: process.env.PAD_ENV === 'devnet' ? 'playthrees33.dot' : 'playthrees33.paseo',
  displayName: 'Thr33s',
  description:
    'Web3 Threes — slide and merge tiles, then anchor your score on an on-chain leaderboard. Proof-of-Personhood only.',
  icon: { path: './icon.png', format: 'png' },
  executables: [
    {
      kind: 'app',
      path: './dist',
      appVersion: [0, 2, 0],
    },
  ],
});
