// Take an old Thr33s DotNS name offline by blanking its records, so hosts show
// "No app with this name" instead of serving a stale build.
//
// Clears, on the name's resolver: contenthash + `executable` text on
// app.<name>, contenthash + `manifest` text on <name>. The name itself stays
// registered to the owner (a later deploy can reuse it). Each call is
// dry-run first, then sent one by one.
//
// Usage (run it yourself; the owner seed never goes in a file or the repo):
//   NAME=playthrees33.dot OWNER_SEED="twelve word mnemonic …" npm run retire:name
// NAME defaults to playthrees33.dot. Devnet only (the registry hosts resolve).

import { createClient, Binary } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';
import { AccountId } from '@polkadot-api/substrate-bindings';
import { encodeFunctionData, decodeFunctionResult, parseAbi, namehash } from 'viem';

const WS_URL = 'wss://asset-hub-paseo-rpc.n.dwellir.com';
// DotNS registry the dev-dot.li gateway and the Polkadot apps resolve
// (pad 0.22.1's devnet set; see DEPLOY.md).
const REGISTRY = '0xb052E5EfC5ADEff1f21d48DEfb5169Cb394A1a73';
const NAME = process.env.NAME?.trim() || 'playthrees33.dot';
const GAS_MULTIPLIER = 2n;

const abi = parseAbi([
  'function resolver(bytes32) view returns (address)',
  'function owner(bytes32) view returns (address)',
  'function setContenthash(bytes32,bytes)',
  'function setText(bytes32,string,string)',
]);

const seed = process.env.OWNER_SEED?.trim();
if (!seed) {
  console.error('ERROR: set OWNER_SEED (the mnemonic that owns the name — the CI MNEMONIC account).');
  process.exit(1);
}

const keyPair = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(seed)))('');
const signer = getPolkadotSigner(keyPair.publicKey, 'Sr25519', keyPair.sign);
const origin = AccountId().dec(keyPair.publicKey);

const client = createClient(getWsProvider(WS_URL));
const api = client.getUnsafeApi();

async function view(to, functionName, args) {
  const data = encodeFunctionData({ abi, functionName, args });
  const r = await api.apis.ReviveApi.call(origin, to, 0n, undefined, undefined, Binary.fromHex(data));
  if (!r.result.success || r.result.value.flags & 1) throw new Error(`${functionName} failed`);
  const out = r.result.value.data;
  const hex = typeof out === 'string' ? out : out.asHex?.() ?? `0x${Buffer.from(out).toString('hex')}`;
  return decodeFunctionResult({ abi, functionName, data: hex });
}

try {
  const root = namehash(NAME);
  const app = namehash(`app.${NAME}`);
  console.log(`Retiring ${NAME} as ${origin}`);
  const resolver = await view(REGISTRY, 'resolver', [root]);
  console.log(`Resolver: ${resolver}`);

  const steps = [
    ['setContenthash', [app, '0x'], `app.${NAME} contenthash`],
    ['setText', [app, 'executable', ''], `app.${NAME} executable`],
    ['setContenthash', [root, '0x'], `${NAME} contenthash`],
    ['setText', [root, 'manifest', ''], `${NAME} manifest`],
  ];

  const txs = [];
  for (const [fn, args, label] of steps) {
    const data = encodeFunctionData({ abi, functionName: fn, args });
    const dry = await api.apis.ReviveApi.call(origin, resolver, 0n, undefined, undefined, Binary.fromHex(data));
    if (!dry.result.success || dry.result.value.flags & 1) {
      console.error(`Dry-run failed for ${label} — is OWNER_SEED the name's owner?`);
      process.exit(1);
    }
    const sd = dry.storage_deposit;
    txs.push([
      label,
      api.tx.Revive.call({
        dest: resolver, // H160 as a hex string (Binary is rejected)
        value: 0n,
        weight_limit: {
          ref_time: dry.weight_required.ref_time * GAS_MULTIPLIER,
          proof_size: dry.weight_required.proof_size * GAS_MULTIPLIER,
        },
        storage_deposit_limit: sd.type === 'Charge' ? sd.value * GAS_MULTIPLIER + 1n : 1n,
        data: Binary.fromHex(data),
      }),
    ]);
    console.log(`  ✓ dry-run ${label}`);
  }

  for (const [label, tx] of txs) {
    const result = await tx.signAndSubmit(signer);
    if (!result.ok) {
      console.error(`Failed at ${label}:`, JSON.stringify(result.dispatchError, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
      process.exit(1);
    }
    console.log(`  ✓ ${label} (block ${result.block.number})`);
  }
  console.log(`Done. ${NAME} no longer serves an app.`);
} finally {
  client.destroy();
}
