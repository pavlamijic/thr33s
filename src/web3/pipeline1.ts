// Fill the extension-pipeline-1 slots that polkadot-api 2.x doesn't know about.
//
// On Asset Hub runtime 3004000 only pipeline 1 (v5 general tx) pays its fee in
// PGAS, so product-account txs are signed with `txExtVersion: 1`. But papi 2.x
// only builds pipeline 0's extensions, and the iOS host refuses to encode a
// pipeline-1 extension the caller supplied no bytes for ("Cannot encode
// transaction extension 'AsScarcity': the caller supplied no bytes"). Each of
// these is "off" for an ordinary call; the host itself fills
// UnitTransactionExtension / VerifyMultiSignature (it signs).
//
// Types checked against devnet metadata: AsScarcity / AsPgas / AsDotnsGateway
// wrap an Option (None = 0x00), RestrictOrigins wraps a bool (false = 0x00);
// all have an empty implicit. Newer product-sdk-host releases (>= ~0.32) fill
// these themselves — drop this wrapper when upgrading.

import type { PolkadotSigner } from 'polkadot-api';

const EMPTY = new Uint8Array();
const OFF = new Uint8Array([0x00]);

const PIPELINE1_DEFAULTS: Record<string, Uint8Array> = {
  AsScarcity: OFF,
  AsPgas: OFF,
  AsDotnsGateway: OFF,
  RestrictOrigins: OFF,
};

export function withPipeline1Defaults(signer: PolkadotSigner): PolkadotSigner {
  return {
    ...signer,
    signTx: (callData, signedExtensions, metadata, atBlockNumber, hasher) => {
      const exts = { ...signedExtensions };
      for (const [identifier, value] of Object.entries(PIPELINE1_DEFAULTS)) {
        if (!exts[identifier]) exts[identifier] = { identifier, value, additionalSigned: EMPTY };
      }
      return signer.signTx(callData, exts, metadata, atBlockNumber, hasher);
    },
  };
}
