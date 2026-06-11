// Deploy Thr33sLeaderboard to the paseo-next-v2 Asset Hub (pallet-revive).
//
// Compiles the Solidity source to PolkaVM bytecode with @parity/resolc, then
// instantiates it over the Substrate WS via PAPI v2. No EVM RPC required.
//
// Usage:
//   DEPLOYER_MNEMONIC="word word ... word" node scripts/deploy.mjs
//
// Prerequisites:
//   - The deployer account (derived from DEPLOYER_MNEMONIC, sr25519) must hold
//     PAS on paseo-next-v2 Asset Hub. Fund it at:
//     https://faucet.polkadot.io/?parachain=1500
//   - paseo-next-v2 has autoAccountMapping=true, so the deployer is mapped to
//     its H160 automatically on first tx.
//
// On success it prints the deployed contract H160 — paste it into
// src/web3/config.ts `contractAddress`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compile } from '@parity/resolc';
import { createClient, Binary } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';

const WS_URL = 'wss://paseo-asset-hub-next-rpc.polkadot.io';
const CONTRACT_NAME = 'Thr33sLeaderboard';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOL_PATH = join(__dirname, '..', 'contracts', `${CONTRACT_NAME}.sol`);

function requireMnemonic() {
  const m = process.env.DEPLOYER_MNEMONIC;
  if (!m) {
    console.error('ERROR: set DEPLOYER_MNEMONIC (a funded sr25519 account on paseo-next-v2).');
    process.exit(1);
  }
  return m.trim();
}

async function main() {
  const mnemonic = requireMnemonic();

  // 1. Compile Solidity → PolkaVM with resolc.
  console.log(`Compiling ${CONTRACT_NAME}.sol with resolc…`);
  const source = readFileSync(SOL_PATH, 'utf8');
  const key = `${CONTRACT_NAME}.sol`;
  const out = await compile({ [key]: { content: source } });
  if (out.errors?.some((e) => e.severity === 'error')) {
    console.error('resolc errors:', out.errors);
    process.exit(1);
  }
  const artifact = out.contracts?.[key]?.[CONTRACT_NAME];
  if (!artifact) {
    console.error('No artifact produced. Output keys:', Object.keys(out.contracts ?? {}));
    process.exit(1);
  }
  const code = `0x${artifact.evm.bytecode.object.replace(/^0x/, '')}`;
  console.log(`Compiled. PolkaVM blob: ${(code.length - 2) / 2} bytes`);

  // 2. Signer from mnemonic (sr25519).
  const miniSecret = entropyToMiniSecret(mnemonicToEntropy(mnemonic));
  const keypair = sr25519CreateDerive(miniSecret)('');
  const signer = getPolkadotSigner(keypair.publicKey, 'Sr25519', keypair.sign);

  // 3. Connect.
  console.log(`Connecting to ${WS_URL}…`);
  const client = createClient(getWsProvider(WS_URL));
  const api = client.getUnsafeApi();
  const { number } = await client.getFinalizedBlock();
  console.log(`Connected. Finalized block #${number}`);

  // 4. Instantiate. No constructor args → empty data. A fixed salt keeps the
  //    deployed address deterministic for re-runs; change it to redeploy fresh.
  const value = 0n;
  const data = Binary.fromHex('0x');
  const salt = Binary.fromHex(`0x${'00'.repeat(32)}`);
  const codeBin = Binary.fromHex(code);

  // Best-effort dry-run to size gas + storage and learn the address. If the
  // runtime-API shape differs, fall back to generous limits and read the
  // address from the Instantiated event after submission.
  let gasLimit;
  let storageDepositLimit;
  let predictedAddr;
  try {
    const origin = (await import('@polkadot-api/substrate-bindings'))
      .AccountId(42)[1](keypair.publicKey);
    const dry = await api.apis.ReviveApi.instantiate(
      origin,
      value,
      undefined,
      undefined,
      { type: 'Upload', value: codeBin },
      data,
      salt,
    );
    console.log('Dry-run result:', JSON.stringify(dry, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 600));
    gasLimit = dry?.gas_required;
    storageDepositLimit = dry?.storage_deposit?.value;
    predictedAddr = dry?.result?.value?.addr ?? dry?.result?.Ok?.addr;
  } catch (err) {
    console.warn('Dry-run failed (will submit with generous limits):', err?.message ?? err);
  }

  if (!gasLimit) gasLimit = { ref_time: 8_000_000_000n, proof_size: 800_000n };
  if (storageDepositLimit == null) storageDepositLimit = 5_000_000_000_000n;

  const tx = api.tx.Revive.instantiate_with_code({
    value,
    gas_limit: gasLimit,
    storage_deposit_limit: storageDepositLimit,
    code: codeBin,
    data,
    salt,
  });

  console.log('Submitting instantiate_with_code…');
  await new Promise((resolve, reject) => {
    tx.signSubmitAndWatch(signer).subscribe({
      next(ev) {
        console.log('  event:', ev.type);
        if (ev.type === 'finalized') {
          if (ev.dispatchError) {
            reject(new Error(`dispatchError: ${JSON.stringify(ev.dispatchError)}`));
            return;
          }
          // Try to read the Instantiated event's contract address.
          const inst = ev.events?.find(
            (e) => e.type === 'Revive' && e.value?.type === 'Instantiated',
          );
          const addr = inst?.value?.value?.contract ?? predictedAddr;
          console.log('\n========================================');
          console.log(`${CONTRACT_NAME} deployed!`);
          console.log('Contract address (H160):', addr ?? '(check explorer — not parsed)');
          console.log('========================================');
          console.log('Update src/web3/config.ts:');
          console.log(`  contractAddress: '${addr ?? '0x...'}' as \`0x\${string}\`,`);
          resolve();
        }
      },
      error: reject,
    });
  });

  client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
