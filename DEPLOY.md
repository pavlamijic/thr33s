# Deploying Thr33s

Thr33s is a Proof-of-Personhood-only app that runs inside the Polkadot host
(Polkadot app, Polkadot Desktop, and the web). The target network is the
`NETWORK` value at the top of `.github/workflows/deploy.yml`:

| `NETWORK` | Asset Hub | Name | Web |
|---|---|---|---|
| `paseo-next-v2` | Asset Hub Next (1500) | `playthrees33.paseo` | `playthrees33.paseo.li` |
| `devnet` (current) | Paseo Asset Hub (1000) | `playthrees33.dot` | `playthrees33.dev-dot.li` |

See <https://docs.polkadotcommunity.foundation/reference/networks/>. Each
network has its own leaderboard contract address in `src/web3/config.ts`.

Two things get deployed:

1. **The leaderboard contract** (`Thr33sLeaderboard.sol`) — once, on-chain.
2. **The frontend** — on every push to `main`, via GitHub Actions →
   `pad` (polkadot-app-deploy) → DotNS + Bulletin chain + on-chain product manifest.

---

## 1. Deploy the leaderboard contract (one-time)

The contract is deployed over the **substrate WS** via `pallet-revive`.

```bash
# DEPLOYER_SEED = a funded sr25519 mnemonic (deploy-only; unrelated to players).
# Fund its SS58 address with PAS on the target Asset Hub (the script prints the
# faucet link: parachain 1500 for paseo-next-v2, 1000 for devnet).
NETWORK=paseo-next-v2 DEPLOYER_SEED="your funded sr25519 mnemonic" npm run deploy:contract
```

`scripts/deploy.mjs` compiles the contract to PolkaVM with `@parity/resolc`,
dry-runs `ReviveApi.instantiate` to size gas, then submits
`Revive.instantiate_with_code` and prints the contract address. Paste that
address into `src/web3/config.ts` → `NETWORKS[<network>].contractAddress`.

> Current deployments: devnet and paseo-next-v2 both at
> `0x8b6cdbf8eb3de22910fd3ca98cb8b1fde4c02e0c` (same deployer + nonce on each
> chain, so the derived address matches).

## 2. Deploy the frontend (on push to `main`)

`.github/workflows/deploy.yml` builds `dist` and runs:

```
pad --js-merkle --env "$NETWORK" --publish \
  --config polkadot-app-deploy.config.ts dist playthrees33
```

Requires repo secret **`MNEMONIC`** — the sr25519 seed that **owns
`playthrees33.dot`** (signs the DotNS writes). On first deploy pad registers
the name with this account, and it uploads the files to Bulletin itself, so it
needs PAS on that network's Asset Hub **and** a storage authorization on that
network's Bulletin chain (<https://paritytech.github.io/polkadot-bulletin-chain/authorizations>,
pick the matching network).

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

- Web: <https://playthrees33.paseo.li> (paseo-next-v2) / <https://playthrees33.dev-dot.li> (devnet)
- Desktop / app: `playthrees33.paseo` / `playthrees33.dot`
