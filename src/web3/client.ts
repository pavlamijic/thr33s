import { createClient, type PolkadotSigner, Binary } from 'polkadot-api';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { getWsProvider } from 'polkadot-api/ws-provider/web';
import { type Address, type Hex, isAddress, bytesToHex, isHex, toHex } from 'viem';
import { CONFIG } from './config';

// Transaction status callback type
export type TransactionStatus =
  | 'signing'
  | 'broadcasting'
  | 'included'
  | 'finalized'
  | 'failed';

// Weight type for gas estimation
interface SubstrateWeight {
  referenceTime: bigint;
  proofSize: bigint;
}

// Result type for contract calls
interface ReviveCallResult {
  gasConsumed: SubstrateWeight;
  gasRequired: SubstrateWeight;
  storageDeposit: { value: bigint };
  result: {
    isOk: boolean;
    isErr: boolean;
    value: {
      data: Hex;
      flags: bigint;
    };
  };
}

// Helper to convert various types to hex string
function convertToHexString(value: unknown): Hex {
  if (!value) return '0x';

  if (typeof (value as any)?.asHex === 'function') return (value as any).asHex();
  if (typeof (value as any)?.toHex === 'function') return (value as any).toHex();
  if (typeof value === 'string' && isHex(value)) return value;
  if (value instanceof Uint8Array) return bytesToHex(value);

  try {
    return toHex(value as any);
  } catch {
    return '0x';
  }
}

// Convert to bigint safely
function convertToBigInt(value: unknown, fallback: bigint = 0n): bigint {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string') return BigInt(value);
    if (value && typeof (value as any).toString === 'function') {
      return BigInt((value as any).toString());
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// Normalize weight object
function normalizeWeight(weight: any): SubstrateWeight {
  const referenceTime = weight?.ref_time ?? weight?.refTime ?? 0;
  const proofSize = weight?.proof_size ?? weight?.proofSize ?? 0;

  return {
    referenceTime: convertToBigInt(referenceTime, 0n),
    proofSize: convertToBigInt(proofSize, 0n),
  };
}

// Extract storage deposit charge
function extractStorageDepositCharge(rawStorageDeposit: any): bigint {
  if (!rawStorageDeposit) return 0n;

  if (typeof rawStorageDeposit?.isCharge === 'boolean') {
    if (rawStorageDeposit.isCharge && rawStorageDeposit.asCharge != null) {
      return convertToBigInt(rawStorageDeposit.asCharge, 0n);
    }
    return 0n;
  }

  if (rawStorageDeposit.charge != null) return convertToBigInt(rawStorageDeposit.charge, 0n);
  if (rawStorageDeposit.Charge != null) return convertToBigInt(rawStorageDeposit.Charge, 0n);
  if (rawStorageDeposit.value != null) return convertToBigInt(rawStorageDeposit.value, 0n);

  return 0n;
}

// Unwrap execution result
function unwrapExecutionResult(rawResult: any): {
  ok: any | null;
  err: any | null;
  successFlag: boolean | null;
} {
  if (!rawResult) return { ok: null, err: null, successFlag: null };

  if (typeof rawResult.success === 'boolean') {
    return rawResult.success
      ? { ok: rawResult.value ?? null, err: null, successFlag: true }
      : { ok: null, err: rawResult.error ?? rawResult.value ?? null, successFlag: false };
  }

  if (typeof rawResult.isOk === 'boolean') {
    return rawResult.isOk
      ? { ok: rawResult.value ?? null, err: null, successFlag: true }
      : { ok: null, err: rawResult.value ?? null, successFlag: false };
  }

  if (rawResult.ok != null) return { ok: rawResult.ok, err: null, successFlag: true };
  if (rawResult.err != null) return { ok: null, err: rawResult.err, successFlag: false };

  return { ok: null, err: rawResult, successFlag: null };
}

// Check if execution reverted
function didExecutionRevert(flags: bigint): boolean {
  return (flags & 1n) === 1n;
}

export class PolkadotClient {
  private client: ReturnType<typeof createClient> | null = null;
  private api: any = null;
  private mappedAccounts: Set<string> = new Set();

  private static readonly DRY_RUN_STORAGE_LIMIT: bigint = 18446744073709551615n;
  private static readonly DRY_RUN_WEIGHT_LIMIT = {
    ref_time: 18446744073709551615n,
    proof_size: 18446744073709551615n,
  };

  // Connect to the chain
  async connect(): Promise<void> {
    if (this.client) return;

    const provider = getWsProvider(CONFIG.rpcEndpoint);
    this.client = createClient(withPolkadotSdkCompat(provider));

    // Get the untyped API for ReviveApi access
    this.api = this.client.getUnsafeApi();
  }

  // Disconnect from the chain
  disconnect(): void {
    this.client?.destroy();
    this.client = null;
    this.api = null;
  }

  // Get EVM address for a substrate address
  async getEvmAddress(substrateAddress: string): Promise<Address> {
    if (isAddress(substrateAddress)) return substrateAddress as Address;
    const address = await this.api.apis.ReviveApi.address(substrateAddress);
    return address.asHex() as Address;
  }

  // Perform a dry run call to estimate gas
  async performDryRunCall(
    originSubstrateAddress: string,
    contractAddress: Address,
    valueInNativeUnits: bigint,
    encodedData: Hex
  ): Promise<ReviveCallResult> {
    if (!this.api) {
      throw new Error('Client not connected');
    }

    const executionResults = await this.api.apis.ReviveApi.call(
      originSubstrateAddress,
      Binary.fromHex(contractAddress),
      valueInNativeUnits,
      PolkadotClient.DRY_RUN_WEIGHT_LIMIT,
      PolkadotClient.DRY_RUN_STORAGE_LIMIT,
      Binary.fromHex(encodedData)
    );

    const { ok, err, successFlag } = unwrapExecutionResult((executionResults as any).result);

    const flags = convertToBigInt(ok?.flags, 0n);
    const returnData = convertToHexString(ok?.data);
    const didRevert = ok ? didExecutionRevert(flags) : true;

    const gasConsumed = normalizeWeight((executionResults as any).weight_consumed);
    const gasRequired = normalizeWeight(
      (executionResults as any).weight_required ?? (executionResults as any).weight_consumed
    );

    const storageDepositValue = extractStorageDepositCharge(
      (executionResults as any).storage_deposit
    );

    const isOk = !!ok && !didRevert;
    const isErr =
      !ok || didRevert || !!err || (typeof successFlag === 'boolean' ? !successFlag : false);

    return {
      gasConsumed,
      gasRequired,
      storageDeposit: { value: storageDepositValue },
      result: {
        isOk,
        isErr,
        value: {
          data: ok ? returnData : '0x',
          flags: ok ? flags : 1n,
        },
      },
    };
  }

  // Check if an account is mapped
  private async checkIfAccountMapped(substrateAddress: string): Promise<boolean> {
    try {
      const evmAddress = await this.getEvmAddress(substrateAddress);
      const key = Binary.fromHex(evmAddress);
      const mappedAccount = await this.api.query.Revive.OriginalAccount.getValue(key);
      return mappedAccount !== null && mappedAccount !== undefined;
    } catch {
      return false;
    }
  }

  // Reverse-map an EVM address to its original Substrate (SS58) account, if
  // the account has been registered via pallet_revive.map_account. Returns
  // null for eth-derived (MetaMask) addresses and unmapped accounts.
  async getSubstrateAddressForEvm(evmAddress: Address): Promise<string | null> {
    if (!this.api) {
      await this.connect();
    }
    try {
      const key = Binary.fromHex(evmAddress);
      const mappedAccount = await this.api.query.Revive.OriginalAccount.getValue(key);
      console.log('[revive] OriginalAccount', evmAddress, '→', mappedAccount, 'typeof=', typeof mappedAccount);
      if (mappedAccount === null || mappedAccount === undefined) return null;
      // AccountId32 may decode as an SS58 string, a hex string, a Uint8Array,
      // or a wrapper with a .toString(). Normalise.
      if (typeof mappedAccount === 'string') return mappedAccount;
      const asAny = mappedAccount as any;
      if (typeof asAny.asHex === 'function') return asAny.asHex();
      if (typeof asAny.toHex === 'function') return asAny.toHex();
      return String(mappedAccount);
    } catch (error) {
      console.warn('[revive] OriginalAccount lookup failed:', error);
      return null;
    }
  }

  // Ensure an account is mapped to an EVM address
  async ensureAccountMapped(
    substrateAddress: string,
    signer: PolkadotSigner
  ): Promise<void> {
    if (this.mappedAccounts.has(substrateAddress)) return;

    const isMapped = await this.checkIfAccountMapped(substrateAddress);
    if (isMapped) {
      this.mappedAccounts.add(substrateAddress);
      return;
    }

    const mappingExtrinsic = this.api.tx.Revive.map_account();

    try {
      await this.signAndSubmitExtrinsic(mappingExtrinsic, signer, () => {});
      this.mappedAccounts.add(substrateAddress);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('AccountAlreadyMapped')) {
        this.mappedAccounts.add(substrateAddress);
        return;
      }
      throw error;
    }
  }

  // Sign and submit an extrinsic
  private signAndSubmitExtrinsic(
    extrinsic: any,
    signer: PolkadotSigner,
    statusCallback: (status: TransactionStatus) => void
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      try {
        extrinsic.signSubmitAndWatch(signer).subscribe({
          next: (event: any) => {
            const transactionHash = event.txHash?.toString();

            switch (event.type) {
              case 'signed':
                statusCallback('signing');
                break;
              case 'broadcasted':
                statusCallback('broadcasting');
                break;
              case 'txBestBlocksState':
                statusCallback('included');
                break;
              case 'finalized':
                if (event.dispatchError) {
                  statusCallback('failed');
                  reject(new Error(`Transaction failed: ${event.dispatchError.toString()}`));
                  return;
                }
                statusCallback('finalized');
                resolve(transactionHash);
                return;
              case 'invalid':
              case 'dropped':
                statusCallback('failed');
                reject(new Error(`Transaction ${event.type}`));
                return;
            }
          },
          error: (error: any) => {
            statusCallback('failed');
            reject(error);
          },
        });
      } catch (error) {
        statusCallback('failed');
        reject(error);
      }
    });
  }

  // Submit a transaction to the contract
  async submitTransaction(
    contractAddress: Address,
    valueInNativeUnits: bigint,
    encodedData: Hex,
    signerSubstrateAddress: string,
    signer: PolkadotSigner,
    statusCallback: (status: TransactionStatus) => void
  ): Promise<string> {
    if (!this.api) {
      throw new Error('Client not connected');
    }

    await this.ensureAccountMapped(signerSubstrateAddress, signer);

    // Estimate gas
    const gasEstimate = await this.performDryRunCall(
      signerSubstrateAddress,
      contractAddress,
      valueInNativeUnits,
      encodedData
    );

    if (!gasEstimate.result.isOk) {
      throw new Error(`Contract execution would revert: ${gasEstimate.result.value.data ?? '0x'}`);
    }

    const weightLimit = {
      proof_size: gasEstimate.gasRequired.proofSize,
      ref_time: gasEstimate.gasRequired.referenceTime,
    };

    // Add buffer to storage deposit
    const minimumStorageDeposit = 2_000_000_000_000n;
    let storageDepositLimit =
      gasEstimate.storageDeposit.value === 0n
        ? minimumStorageDeposit
        : (gasEstimate.storageDeposit.value * 120n) / 100n;

    if (storageDepositLimit < minimumStorageDeposit) {
      storageDepositLimit = minimumStorageDeposit;
    }

    const callExtrinsic = this.api.tx.Revive.call({
      dest: Binary.fromHex(contractAddress),
      value: valueInNativeUnits,
      weight_limit: weightLimit,
      storage_deposit_limit: storageDepositLimit,
      data: Binary.fromHex(encodedData),
    });

    return await this.signAndSubmitExtrinsic(callExtrinsic, signer, statusCallback);
  }

  // Make a read-only contract call
  async callContract(
    contractAddress: Address,
    encodedData: Hex,
    originAddress: string
  ): Promise<Hex> {
    if (!this.api) {
      throw new Error('Client not connected');
    }

    const result = await this.performDryRunCall(
      originAddress,
      contractAddress,
      0n,
      encodedData
    );

    if (!result.result.isOk) {
      throw new Error('Contract call failed');
    }

    return result.result.value.data;
  }
}

// Singleton instance
export const polkadotClient = new PolkadotClient();
