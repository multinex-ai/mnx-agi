/** Every way a request can be refused. The gate denies by default: anything not listed as allowed is one of these. */
export type DenyCode =
  | "malformed"
  | "unknown_issuer"
  | "bad_signature"
  | "wrong_audience"
  | "not_yet_valid"
  | "expired"
  | "lifetime_too_long"
  | "revoked"
  | "bad_request_signature"
  | "token_binding_mismatch"
  | "stale_request"
  | "replay"
  | "replay_cache_full"
  | "not_granted"
  | "budget_exhausted"
  | "payload_too_large"
  | "unknown_action"
  | "handler_error";

export class VisaError extends Error {
  readonly code: DenyCode;
  constructor(code: DenyCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "VisaError";
    this.code = code;
  }
}
