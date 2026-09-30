# Deploying Thr33s

Thr33s is a Proof-of-Personhood-only app that runs inside the Polkadot host
(Polkadot app, Polkadot Desktop, and the web at `playthrees33.dev-dot.li`). It
targets the **devnet** environment (Paseo Asset Hub 1000 / Bulletin 1010) —
see <https://docs.polkadotcommunity.foundation/reference/networks/>.

Two things get deployed:

1. **The leaderboard contract** (`Thr33sLeaderboard.sol`) — once, on-chain.
2. **The frontend** — on every push to `main`, via GitHub Actions →
   `pad` (polkadot-app-deploy) → DotNS + Bulletin chain + on-chain product manifest.

---

## 1. Deploy the leaderboard contract (one-time)

The contract is deployed over the **substrate WS** via `pallet-revive`.

```bash
# DEPLOYER_SEED = a funded sr25519 mnemonic (deploy-only; unrelated to players).
# Fund its SS58 address with PAS: https://faucet.polkadot.io/?parachain=1000
DEPLOYER_SEED="your funded sr25519 mnemonic" npm run deploy:contract
```

`scripts/deploy.mjs` compiles the contract to PolkaVM with `@parity/resolc`,
dry-runs `ReviveApi.instantiate` to size gas, then submits
`Revive.instantiate_with_code` and prints the contract address. Paste that
address into `src/web3/config.ts` → `contractAddress`.

> Current deployment (devnet): `0x8b6cdbf8eb3de22910fd3ca98cb8b1fde4c02e0c`.

## 2. Deploy the frontend (on push to `main`)

`.github/workflows/deploy.yml` builds `dist` and runs:

```
pad --js-merkle --env devnet --publish \
  --config polkadot-app-deploy.config.ts dist playthrees33.dot
```

Requires repo secret **`MNEMONIC`** — the sr25519 seed that **owns
`playthrees33.dot`** (signs the DotNS writes). On first deploy pad registers
the name with this account, so it needs PAS on Paseo Asset Hub.

### The product manifest (`polkadot-app-deploy.config.ts`) — required

`--config` is what makes the host *launch + version* the app. It publishes the
on-chain **product manifest**:

- root manifest on `playthrees33.dot` (display name + icon),
- an **executable record on `app.playthrees33.dot`** pinning **`appVersion` + CID**.

Without it you only set a bare "legacy contenthash", which the host won't
version/refresh cleanly. **Bump `appVersion` in `polkadot-app-deploy.config.ts` on
every release** — that's the signal the host uses to pick up a new build.

Publishing the manifest is parent-authorised text-record / subname writes, so
it needs **no Proof-of-Personhood**.

## 3. Account mapping — no PAS funding needed

A PoP product account (`/product/0`) is a soft-derived key, not an Asset Hub
account, so contract calls first fail with `Revive.AccountUnmapped`. The app
fixes this at connect time by requesting a **`SmartContractAllowance`** via
`requestResourceAllocation` (`src/web3/host-wallet.ts`): the host mints PGAS to
the product account → creates + auto-maps it on Asset Hub → and authorises
`AsPgas` so the leaderboard's Revive gas is sponsored. No PAS, no Alice funding.

---

## URLs

- Web: <https://playthrees33.dev-dot.li>
- Desktop / app: `playthrees33.dot`
