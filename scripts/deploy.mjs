// Deploy Thr33sLeaderboard to an Asset Hub (pallet-revive) over the
// SUBSTRATE WS via PAPI — the method the festival reference app uses on this
// chain family (scripts/deploy/deploy-festival.ts): Revive.instantiate_with_code
// with a sr25519 signer, not an eth-rpc create.
//
// Compiles to PolkaVM with @parity/resolc, dry-runs ReviveApi.instantiate to
// size gas + storage and learn the address, then submits instantiate_with_code.
//
// Usage:
//   NETWORK=paseo-next-v2|devnet DEPLOYER_SEED="twelve word mnemonic ..." node scripts/deploy.mjs
// (NETWORK defaults to paseo-next-v2, matching src/web3/config.ts.)
//
// The deployer is sr25519, deploy-only (unrelated to the app's PoP identity).
// Its SS58 address must hold PAS on the target Asset Hub — the script prints
// the address + balance and the faucet link for the chosen network.
// (autoAccountMapping=true maps it to its H160 on first tx).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compile } from '@parity/resolc';
import { createClient, Binary } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';
import { AccountId } from '@polkadot-api/substrate-bindings';

const NETWORKS = {
  'paseo-next-v2': { ws: 'wss://paseo-asset-hub-next-rpc.polkadot.io', parachain: 1500 },
  devnet: { ws: 'wss://asset-hub-paseo-rpc.n.dwellir.com', parachain: 1000 },
};
const NETWORK = process.env.NETWORK?.trim() || 'paseo-next-v2';
if (!NETWORKS[NETWORK]) {
  console.error(`ERROR: unknown NETWORK "${NETWORK}" (use ${Object.keys(NETWORKS).join(' | ')})`);
  process.exit(1);
}
const WS_URL = NETWORKS[NETWORK].ws;
const FAUCET_URL = `https://faucet.polkadot.io/?parachain=${NETWORKS[NETWORK].parachain}`;
const CONTRACT_NAME = 'Thr33sLeaderboard';
const NATIVE_DECIMALS = 10n; // Paseo substrate layer
const DRY_RUN_DEPOSIT = 50n * 10n ** NATIVE_DECIMALS;
const GAS_MULTIPLIER = 4n;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOL_PATH = join(__dirname, '..', 'contracts', `${CONTRACT_NAME}.sol`);

function jsonSafe(v) {
  return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
}

async function main() {
  const seed = process.env.DEPLOYER_SEED?.trim();
  if (!seed) {
    console.error('ERROR: set DEPLOYER_SEED (a 12/24-word sr25519 mnemonic).');
    console.error(`Its SS58 address must hold PAS on ${NETWORK} Asset Hub; fund at`);
    console.error(FAUCET_URL);
    process.exit(1);
  }

  // 1. Compile Solidity → PolkaVM.
  console.log(`Compiling ${CONTRACT_NAME}.sol with resolc…`);
  const key = `${CONTRACT_NAME}.sol`;
  const out = await compile({ [key]: { content: readFileSync(SOL_PATH, 'utf8') } });
  if (out.errors?.some((e) => e.severity === 'error')) {
    console.error('resolc errors:', out.errors);
    process.exit(1);
  }
  const code = `0x${out.contracts[key][CONTRACT_NAME].evm.bytecode.object.replace(/^0x/, '')}`;
  console.log(`Compiled. PolkaVM blob: ${(code.length - 2) / 2} bytes`);

  // 2. Signer (sr25519 from mnemonic).
  const keyPair = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(seed)))('');
  const signer = getPolkadotSigner(keyPair.publicKey, 'Sr25519', keyPair.sign);
  const origin = AccountId(42).dec(keyPair.publicKey);
  console.log('Deployer SS58:', origin);

  // 3. Connect.
  console.log(`Connecting to ${NETWORK} (${WS_URL})…`);
  const client = createClient(getWsProvider(WS_URL));
  const api = client.getUnsafeApi();
  const finalized = await client.getFinalizedBlock();
  console.log(`Connected. Finalized block #${finalized.number}`);

  try {
    const acct = await api.query.System.Account.getValue(origin);
    const free = acct?.data?.free ?? 0n;
    console.log(`Deployer free balance: ${free}`);
    if (free === 0n) {
      console.error(`\nDeployer has no PAS. Fund ${origin} at`);
      console.error(`${FAUCET_URL} and re-run.`);
      process.exit(1);
    }
  } catch (e) {
    console.warn('Balance check skipped:', e?.message ?? e);
  }

  // 4. Dry-run instantiate to size gas + storage and predict the address.
  //    No constructor args → empty data, salt undefined. weight_limit (NOT
  //    gas_limit) is the field name pallet-revive uses, same as Revive.call.
  console.log('Dry-running ReviveApi.instantiate…');
  const dryRun = await api.apis.ReviveApi.instantiate(
    origin,
    0n,
    undefined,
    DRY_RUN_DEPOSIT,
    { type: 'Upload', value: Binary.fromHex(code) },
    Binary.fromHex('0x'),
    undefined,
  );

  if (!dryRun.result.success) {
    console.error('Dry-run failed:', jsonSafe(dryRun.result.value));
    process.exit(1);
  }
  if (dryRun.result.value.result?.flags & 1) {
    console.error('Constructor reverted in dry-run');
    process.exit(1);
  }

  const gasLimit = {
    ref_time: dryRun.weight_required.ref_time * GAS_MULTIPLIER,
    proof_size: dryRun.weight_required.proof_size * GAS_MULTIPLIER,
  };
  const sd = dryRun.storage_deposit;
  const storageDepositLimit =
    sd.type === 'Charge' && sd.value > 0n ? sd.value * GAS_MULTIPLIER : DRY_RUN_DEPOSIT;
  console.log(`Gas ref_time=${gasLimit.ref_time} proof_size=${gasLimit.proof_size}; storage=${storageDepositLimit}`);

  // 5. Submit.
  console.log('Submitting instantiate_with_code…');
  const tx = api.tx.Revive.instantiate_with_code({
    value: 0n,
    weight_limit: gasLimit,
    storage_deposit_limit: storageDepositLimit,
    code: Binary.fromHex(code),
    data: Binary.fromHex('0x'),
    salt: undefined,
  });
  const result = await tx.signAndSubmit(signer);

  if (!result.ok) {
    console.error('Deployment failed:', jsonSafe(result.dispatchError));
    process.exit(1);
  }

  // 6. Extract address from the Instantiated event, fall back to dry-run.
  let addr;
  for (const ev of result.events) {
    if (ev.type === 'Revive' && ev.value?.type === 'Instantiated') {
      const raw = ev.value.value?.contract;
      addr = typeof raw === 'string' ? raw : raw?.asHex?.() ?? (raw ? `0x${Buffer.from(raw).toString('hex')}` : undefined);
      break;
    }
  }
  if (!addr) {
    const predicted = dryRun.result.value.addr ?? dryRun.result.value.account_id;
    addr = typeof predicted === 'string' ? predicted : predicted?.asHex?.();
  }

  console.log('\n========================================');
  console.log(`${CONTRACT_NAME} deployed!`);
  console.log('Contract address (H160):', addr ?? '(check Instantiated event in explorer)');
  console.log('========================================');
  console.log(`Update src/web3/config.ts (NETWORKS['${NETWORK}']):`);
  console.log(`  contractAddress: '${addr ?? '0x...'}' as \`0x\${string}\`,`);

  client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
