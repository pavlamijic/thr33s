// Deploy Thr33sLeaderboard to paseo-next-v2 Asset Hub (pallet-revive) via its
// EVM ETH-RPC — the path the reference app t3rminal uses on the same chain.
// Contracts deploy through the eth-rpc (eth_sendRawTransaction create), NOT the
// substrate `Revive.instantiate_with_code` extrinsic (which the runtime doesn't
// expose → "Incompatible runtime entry").
//
// Compiles the Solidity to PolkaVM with @parity/resolc, then deploys with viem
// using a throwaway ECDSA key (unrelated to any wallet/DotNS account).
//
// Usage:
//   1. Generate + fund a deployer key (run with no key set):
//        node scripts/deploy.mjs
//      → prints a fresh DEPLOYER_PRIVATE_KEY and its 0x address. Save the key,
//        fund the address with PAS: https://faucet.polkadot.io/?parachain=1500
//   2. Deploy:
//        DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy.mjs
//      → prints the deployed contract address for src/web3/config.ts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compile } from '@parity/resolc';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const ETH_RPC = 'https://testnet-passet-hub-eth-rpc.polkadot.io';
const CHAIN_ID = 420420417;
const CONTRACT_NAME = 'Thr33sLeaderboard';

const paseoNextV2 = defineChain({
  id: CHAIN_ID,
  name: 'Paseo Next v2 Asset Hub',
  nativeCurrency: { name: 'Paseo', symbol: 'PAS', decimals: 18 },
  rpcUrls: { default: { http: [ETH_RPC] } },
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOL_PATH = join(__dirname, '..', 'contracts', `${CONTRACT_NAME}.sol`);

async function main() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();

  // No key → generate one and stop, so the user can save + fund it.
  if (!rawKey) {
    const pk = generatePrivateKey();
    const acct = privateKeyToAccount(pk);
    console.log('No DEPLOYER_PRIVATE_KEY set — generated a throwaway deployer key.\n');
    console.log('  DEPLOYER_PRIVATE_KEY =', pk);
    console.log('  address              =', acct.address);
    console.log('\nNext:');
    console.log('  1. Save that key somewhere (it is throwaway, deploy-only).');
    console.log(`  2. Fund ${acct.address} with PAS:`);
    console.log('     https://faucet.polkadot.io/?parachain=1500');
    console.log(`  3. DEPLOYER_PRIVATE_KEY=${pk} node scripts/deploy.mjs`);
    process.exit(0);
  }

  const account = privateKeyToAccount(rawKey);
  console.log('Deployer address:', account.address);

  // 1. Compile Solidity → PolkaVM with resolc.
  console.log(`Compiling ${CONTRACT_NAME}.sol with resolc…`);
  const key = `${CONTRACT_NAME}.sol`;
  const out = await compile({ [key]: { content: readFileSync(SOL_PATH, 'utf8') } });
  if (out.errors?.some((e) => e.severity === 'error')) {
    console.error('resolc errors:', out.errors);
    process.exit(1);
  }
  const artifact = out.contracts?.[key]?.[CONTRACT_NAME];
  const abi = artifact.abi;
  const bytecode = `0x${artifact.evm.bytecode.object.replace(/^0x/, '')}`;
  console.log(`Compiled. PolkaVM blob: ${(bytecode.length - 2) / 2} bytes`);

  // 2. Connect + sanity-check the chain.
  const publicClient = createPublicClient({ chain: paseoNextV2, transport: http(ETH_RPC) });
  const walletClient = createWalletClient({ account, chain: paseoNextV2, transport: http(ETH_RPC) });

  const chainId = await publicClient.getChainId();
  if (chainId !== CHAIN_ID) {
    console.warn(`Warning: eth_chainId returned ${chainId}, expected ${CHAIN_ID}`);
  }
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Deployer balance: ${balance} planck`);
  if (balance === 0n) {
    console.error(`\nDeployer has no PAS. Fund ${account.address} at`);
    console.error('https://faucet.polkadot.io/?parachain=1500 and re-run.');
    process.exit(1);
  }

  // 3. Deploy (no constructor args).
  console.log('Deploying…');
  const hash = await walletClient.deployContract({ abi, bytecode });
  console.log('Tx hash:', hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== 'success' || !receipt.contractAddress) {
    console.error('Deployment failed. Receipt:', receipt);
    process.exit(1);
  }

  console.log('\n========================================');
  console.log(`${CONTRACT_NAME} deployed!`);
  console.log('Contract address:', receipt.contractAddress);
  console.log('========================================');
  console.log('Update src/web3/config.ts:');
  console.log(`  contractAddress: '${receipt.contractAddress}' as \`0x\${string}\`,`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
