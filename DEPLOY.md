# Deploying Thr33s

Thr33s is a Proof-of-Personhood-only app that runs inside the Polkadot host
(Polkadot app, Polkadot Desktop, and the web). Pushes to `main` deploy to
devnet; run the workflow manually (`gh workflow run deploy.yml -f network=paseo-next-v2`)
to target the other network:

| `NETWORK` | Asset Hub | Name | Web |
|---|---|---|---|
| `paseo-next-v2` | Asset Hub Next (1500) | `playthrees33.paseo` | `playthrees33.paseo.li` |
| `devnet` (current) | Paseo Asset Hub (1000) | `playthr33s.dot` | `playthr33s.dev-dot.li` |

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
pad --js-merkle --env "$NETWORK" \
  --config polkadot-app-deploy.config.ts dist playthr33s.dot   # playthrees33.paseo on paseo-next-v2
```

> **pad is pinned to `@polkadot-community-foundation/polkadot-app-deploy@0.22.1`.**
> `@parity/polkadot-app-deploy` 0.24 writes devnet names to a newer DotNS
> deployment (registry `0x527b…`) that the gateway and the Polkadot apps don't
> resolve yet (they read `0xb052…`) — the app then shows "No app with this
> name". Re-check before upgrading. (`--publish`, the host-directory listing
> flag, no longer exists.)

Requires repo secret **`MNEMONIC`** — the sr25519 seed that **owns
`playthr33s.dot`** (signs the DotNS writes). On first deploy pad registers
the name with this account, and it uploads the files to Bulletin itself, so it
needs PAS on that network's Asset Hub **and** a storage authorization on that
network's Bulletin chain (<https://paritytech.github.io/polkadot-bulletin-chain/authorizations>,
pick the matching network).

### The product manifest (`polkadot-app-deploy.config.ts`) — required

`--config` is what makes the host *launch + version* the app. It publishes the
on-chain **product manifest**:

- root manifest on `playthr33s.dot` (display name + icon),
- an **executable record on `app.playthr33s.dot`** pinning **`appVersion` + CID**.

Without it you only set a bare "legacy contenthash", which the host won't
version/refresh cleanly. **Bump `appVersion` in `polkadot-app-deploy.config.ts` on
every release** — that's the signal the host uses to pick up a new build.

Publishing the manifest is parent-authorised text-record / subname writes, so
it needs **no Proof-of-Personhood**.

## 3. Fees: PGAS, not PAS

Players never need PAS on devnet. At sign-in the app requests a
**`SmartContractAllowance`** (`requestResourceAllocation`, in
`src/web3/host-wallet.ts`). The host then mints **PGAS** to the player's product
account and maps it for `pallet-revive`, so there's no `Revive.AccountUnmapped`.

PGAS only pays the fee on **v5 general transactions** (extension pipeline 1),
where the runtime's `ChargePGAS` burns it (`PgasAllowance.PGASFeePaid`). The
SDK's default, a v4 signed transaction, is always charged in PAS and fails
with `Invalid.Payment`. So, per network in `src/web3/config.ts`:

- `txExtVersion: 1` on devnet, so the host signer builds v5 transactions;
- `src/web3/pipeline1.ts` supplies "off" values for the pipeline-1 extensions
  that polkadot-api 2.x doesn't fill (`AsScarcity`, `AsPgas`, `AsDotnsGateway`,
  `RestrictOrigins`). Without them the iOS host refuses to encode the
  transaction. Newer `product-sdk-host` releases fill these themselves, so drop
  the file when upgrading.

Paseo Next v2 has no PGAS fee path: there `txExtVersion` stays 0 and players
need PAS.

---

## URLs

- Web: <https://playthrees33.paseo.li> (paseo-next-v2) / <https://playthr33s.dev-dot.li> (devnet)
- Desktop / app: `playthrees33.paseo` / `playthr33s.dot`
