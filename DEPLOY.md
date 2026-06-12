# Deploying Thr33s

Thr33s is a Proof-of-Personhood-only app that runs inside the Polkadot host
(Polkadot app, Polkadot Desktop, and the web at `playthrees33.paseo.li`). It
targets the **paseo-next-v2** testnet — the same network the reference apps
(`festival`, `t3rminal`) use, and the one the live gateways resolve.

Two things get deployed:

1. **The leaderboard contract** (`Thr33sLeaderboard.sol`) — once, on-chain.
2. **The frontend** — on every push to `main`, via GitHub Actions →
   `bulletin-deploy` → DotNS + Bulletin chain + on-chain product manifest.

---

## 1. Deploy the leaderboard contract (one-time)

paseo-next-v2 exposes **no public EVM eth-rpc**, so the contract is deployed
over the **substrate WS** via `pallet-revive` (mirrors `festival`'s deploy).

```bash
# DEPLOYER_SEED = a funded sr25519 mnemonic (deploy-only; unrelated to players).
# Fund its SS58 address with PAS: https://faucet.polkadot.io/?parachain=1500
DEPLOYER_SEED="your funded sr25519 mnemonic" npm run deploy:contract
```

`scripts/deploy.mjs` compiles the contract to PolkaVM with `@parity/resolc`,
dry-runs `ReviveApi.instantiate` to size gas, then submits
`Revive.instantiate_with_code` and prints the contract address. Paste that
address into `src/web3/config.ts` → `contractAddress`.

> Current deployment: `0xa63df27cdea854535612a5deff044e2075716d89`.

## 2. Deploy the frontend (on push to `main`)

`.github/workflows/deploy.yml` builds `dist` and runs:

```
bulletin-deploy --js-merkle --env paseo-next-v2 --publish \
  --config bulletin-deploy.config.ts dist playthrees33.dot
```

Requires repo secret **`MNEMONIC`** — the sr25519 seed that **owns
`playthrees33.dot`** (signs the DotNS writes).

### The product manifest (`bulletin-deploy.config.ts`) — required

`--config` is what makes the host *launch + version* the app. It publishes the
on-chain **product manifest**:

- root manifest on `playthrees33.dot` (display name + icon),
- an **executable record on `app.playthrees33.dot`** pinning **`appVersion` + CID**.

Without it you only set a bare "legacy contenthash", which the host won't
version/refresh cleanly. **Bump `appVersion` in `bulletin-deploy.config.ts` on
every release** — that's the signal the host uses to pick up a new build.

Publishing the manifest is parent-authorised text-record / subname writes, so
it needs **no Proof-of-Personhood** (unlike `--publish`, below).

## 3. Account mapping — no PAS funding needed

A PoP product account (`/product/0`) is a soft-derived key, not an Asset Hub
account, so contract calls first fail with `Revive.AccountUnmapped`. The app
fixes this at connect time by requesting a **`SmartContractAllowance`** via
`requestResourceAllocation` (`src/web3/host-wallet.ts`): the host mints PGAS to
the product account → creates + auto-maps it on Asset Hub → and authorises
`AsPgas` so the leaderboard's Revive gas is sponsored. No PAS, no Alice funding.

## 4. Discoverability on the host directory (`playground.dot`) — needs PoP

`--publish` lists `playthrees33.dot` in the on-chain **Publisher registry**,
which is what surfaces the app in the host's directory/launcher. It reverts with
`NoPersonhood` until the **owner account (`MNEMONIC`)** has full
Proof-of-Personhood (the failure is non-fatal — the deploy still succeeds).

To grant PoP to the owner account (paseo-next-v2 / "Next V2"):

```bash
npm i -g @parity/dotns-cli -f
# 1. Fund the account, then claim personhood + bootstrap DotNS:
#    https://sudo.personhood.dev/personhood-faucet   (pick "Next V2", paste mnemonic)
#    https://sudo.personhood.dev/dotns-bootstrap      (same; follow each step)
# 2. Verify — should report "full", not "none":
dotns pop status -m "<owner mnemonic>"
# 3. (Re)register the domain under the now-personhood'd account if needed:
dotns register domain -n playthrees33 -m "<owner mnemonic>"
```

Once the owner has PoP, the next push to `main` re-runs `--publish` and the app
becomes discoverable.

---

## Gotchas (hard-won)

- **No eth-rpc on paseo-next-v2.** Deploy contracts over the substrate WS, not
  hardhat/viem against an eth-rpc (`testnet-passet-hub-eth-rpc.polkadot.io` is
  dead; `eth-rpc-testnet.polkadot.io` is the *old* stable Paseo — wrong chain).
- **Web gateway is `paseo.li`** (`playthrees33.paseo.li`), not `dot.li` (mainnet,
  now third-party). Desktop/app use `playthrees33.dot`.
- **Connect via `getAccountsProvider`, not `SignerManager`.** `SignerManager`
  throws `NoAccountsError` for PoP-only users (they have zero legacy accounts).
- **PAPI v2 build break:** pin `@polkadot-api/json-rpc-provider` to `0.2.0`
  (npm `overrides`) — the hoisted `0.0.1` has empty exports.
- **Rotate the `MNEMONIC`** if it's ever exposed; it owns the name + signs deploys.

## URLs

- Web: <https://playthrees33.paseo.li>
- Desktop / app: `playthrees33.dot`
