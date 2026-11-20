// Pay transaction fees in PGAS instead of native PAS.
//
// Product accounts on the Products Devnet hold PGAS (minted by the host when it
// grants the SmartContractAllowance), not PAS. Fees are charged by
// `ChargeAssetTxPayment { tip, asset_id: Option<Location> }`; PAPI fills
// `asset_id = None` (pay in PAS), so the account fails with Invalid.Payment.
// This wraps the host signer and rewrites that extension to name the PGAS
// asset; Asset Hub swaps it to PAS through the PAS/PGAS asset-conversion pool.
//
// (`AsPgas` is a different extension — it only carries the ring-VRF proof for
// *claiming* PGAS, which the host does itself.)

import type { PolkadotSigner } from 'polkadot-api';
import { compact } from '@polkadot-api/substrate-bindings';

const ASSETS_PALLET_INSTANCE = 50;

// SCALE: Compact<tip = 0> ++ Some(Location { parents: 0,
//   interior: X2[PalletInstance(50), GeneralIndex(assetId)] })
export function encodeAssetFeePayment(assetId: number): Uint8Array {
  const generalIndex = compact.enc(BigInt(assetId));
  return new Uint8Array([
    0x00, // tip: Compact(0)
    0x01, // asset_id: Some
    0x00, // parents: 0
    0x02, // Junctions::X2
    0x04, ASSETS_PALLET_INSTANCE, // Junction::PalletInstance(50)
    0x05, ...generalIndex, // Junction::GeneralIndex(Compact<u128>)
  ]);
}

export function withFeeAsset(signer: PolkadotSigner, assetId: number): PolkadotSigner {
  const value = encodeAssetFeePayment(assetId);
  return {
    ...signer,
    signTx: (callData, signedExtensions, metadata, atBlockNumber, hasher) => {
      const current = signedExtensions.ChargeAssetTxPayment;
      const exts = current
        ? { ...signedExtensions, ChargeAssetTxPayment: { ...current, value } }
        : signedExtensions;
      return signer.signTx(callData, exts, metadata, atBlockNumber, hasher);
    },
  };
}
