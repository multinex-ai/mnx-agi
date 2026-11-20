import { b64urlDecode, b64urlEncode } from "./encoding.ts";

const ED25519 = { name: "Ed25519" } as const;

/** An Ed25519 key pair held by an agent. Its public half is bound into the VISA it is issued. */
export class AgentKey {
  readonly publicKey: string;
  private readonly privateKey: CryptoKey;

  private constructor(publicKey: string, privateKey: CryptoKey) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  static async generate(): Promise<AgentKey> {
    const pair = await crypto.subtle.generateKey(ED25519, true, ["sign", "verify"]) as CryptoKeyPair;
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    return new AgentKey(b64urlEncode(raw), pair.privateKey);
  }

  /** Restore from `publicKey` and `exportSecret()`, e.g. inside a sandboxed child process. */
  static async import(exported: { publicKey: string; privateKey: string }): Promise<AgentKey> {
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      b64urlDecode(exported.privateKey),
      ED25519,
      false,
      ["sign"],
    );
    return new AgentKey(exported.publicKey, privateKey);
  }

  /**
   * PKCS#8 private key, for handing the key to the agent's own process. Treat it as a secret.
   * Only available on a key made by `generate()`; an imported key is not extractable.
   */
  async exportSecret(): Promise<string> {
    return b64urlEncode(new Uint8Array(await crypto.subtle.exportKey("pkcs8", this.privateKey)));
  }

  async sign(message: BufferSource): Promise<string> {
    return b64urlEncode(new Uint8Array(await crypto.subtle.sign(ED25519, this.privateKey, message)));
  }
}

export async function importPublicKey(rawBase64url: string): Promise<CryptoKey> {
  const raw = b64urlDecode(rawBase64url);
  if (raw.length !== 32) throw new Error("Ed25519 public key must be 32 bytes");
  return await crypto.subtle.importKey("raw", raw, ED25519, false, ["verify"]);
}

export async function verifySignature(
  publicKey: CryptoKey,
  message: BufferSource,
  signature: string,
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(ED25519, publicKey, b64urlDecode(signature), message);
  } catch {
    return false;
  }
}
