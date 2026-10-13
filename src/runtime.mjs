import { createHash, randomUUID } from 'node:crypto';

const nonempty = x => typeof x === 'string' && x.trim().length > 0;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sameScope = (a, b) => ['service', 'principal', 'namespace', 'realm'].every(k => nonempty(a?.[k]) && a[k] === b?.[k]);
const operations = new Set(['read', 'write', 'checkpoint', 'resume', 'update', 'delete', 'reflect', 'transfer']);
const digest = value => createHash('sha256').update(value).digest('hex');

/** The host supplies trusted adapters; model-provided declarations are not adapters.
 * This boundary controls only calls routed through it. Backend ACLs remain required.
 */
export function createRuntime({ binding, adapter, authorize, audit, clock = Date.now }) {
  if (!sameScope(binding, binding) || typeof adapter?.identity !== 'function' ||
      typeof adapter?.execute !== 'function' || typeof authorize !== 'function' || typeof audit !== 'function') fail('invalid_runtime_configuration');
  const expected = Object.freeze(structuredClone(binding));
  async function execute(input) {
    const request = structuredClone(input);
    if (!operations.has(request.operation) || !nonempty(request.purpose) || !nonempty(request.operationId)) fail('invalid_operation');
    // Never allow caller-supplied namespace/identity overrides to reach the adapter.
    if (Object.keys(request).some(k => !['operation', 'purpose', 'operationId', 'payload', 'expectedVersion', 'grantId', 'destination', 'dataClass'].includes(k))) fail('unknown_operation_field');
    if (request.operation === 'update' && (!Number.isSafeInteger(request.expectedVersion) || request.expectedVersion < 0)) fail('expected_version_required');
    const started = clock();
    const receipt = { schemaVersion: 1, receiptId: randomUUID(), operation: request.operation,
      operationDigest: digest(request.operationId), scopeDigest: digest(JSON.stringify(expected)), status: 'denied' };
    let dispatched = false;
    try {
      const identity = await adapter.identity();
      if (!sameScope(expected, identity)) fail('scope_mismatch');
      const decision = await authorize(structuredClone({ binding: expected, request, identity }));
      // This callback must resolve current host policy/grants, never trust payload assertions.
      if (decision?.allowed !== true || !nonempty(decision.policyRevision) ||
          !Number.isFinite(decision.expiresAt) || decision.expiresAt <= clock()) fail('authorization_missing_or_expired');
      receipt.policyRevisionDigest = digest(decision.policyRevision);
      if (request.operation === 'transfer') {
        if (!sameScope(request.destination, request.destination) || !nonempty(request.grantId) || !nonempty(request.dataClass)) fail('invalid_transfer');
        const grant = decision.grant;
        if (!grant || grant.id !== request.grantId || !sameScope(grant.source, expected) ||
            !sameScope(grant.destination, request.destination) || grant.purpose !== request.purpose ||
            !Array.isArray(grant.dataClasses) || !grant.dataClasses.includes(request.dataClass) ||
            grant.revoked !== false || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= clock()) fail('invalid_grant');
        // An atomic backend must revalidate revocation and consume the operation id with dispatch.
        if (adapter.capabilities?.atomicGrantConsumption !== true) fail('atomic_transfer_unavailable');
        if (JSON.stringify(request.payload) === undefined || !Number.isSafeInteger(grant.maxBytes) ||
            grant.maxBytes < 1 || Buffer.byteLength(JSON.stringify(request.payload)) > grant.maxBytes) fail('projection_exceeds_grant');
      }
      if (request.operation === 'update' && adapter.capabilities?.compareAndSwap !== true) fail('conditional_write_unavailable');
      if (request.operation === 'delete' && adapter.capabilities?.delete !== true) fail('deletion_unavailable');
      const exclusion = request.payload?.excludeFromLearning ?? request.payload?.metadata?.exclude_from_learning;
      if (request.operation === 'write' && exclusion != null && exclusion !== false && adapter.capabilities?.learningExclusion !== true) fail('learning_exclusion_unverified');
      if (request.operation === 'reflect' && adapter.capabilities?.learningExclusion !== true) fail('learning_exclusion_unverified');
      // Recheck current connection immediately before dispatch, after asynchronous authorization.
      if (!sameScope(expected, await adapter.identity())) fail('scope_changed');
      if (decision.expiresAt <= clock()) fail('authorization_expired');
      if (request.operation === 'transfer' && (decision.grant.revoked !== false || decision.grant.expiresAt <= clock())) fail('grant_expired_or_revoked');
      await audit({ ...receipt, status: 'dispatching' });
      dispatched = true;
      const result = await adapter.execute({ binding: expected, request, decision });
      if (!sameScope(expected, result?.binding)) fail('response_scope_mismatch');
      if (request.operation === 'transfer' && (!nonempty(result.destinationReceipt) || !sameScope(request.destination, result.destination))) fail('transfer_receipt_missing');
      receipt.status = 'observed';
      await audit({ ...receipt, durationMs: clock() - started });
      return result;
    } catch (error) {
      // A dispatched mutation may have succeeded. Never automatically replay it.
      receipt.status = dispatched ? 'outcome_unconfirmed' : 'denied';
      try { await audit({ ...receipt, durationMs: clock() - started }); } catch { /* Preserve sanitized outcome below. */ }
      const e = new Error(dispatched ? 'operation_outcome_unconfirmed' : (error.code ?? 'operation_denied'));
      e.code = e.message; e.reconcileRequired = dispatched && request.operation !== 'read';
      throw e;
    }
  }
  return Object.freeze({ execute });
}

/** Poll by a known receipt ID. This helper never writes or broadens scope. */
export async function waitForVisibility({ id, readExact, search, attempts = 4, delayMs = 1000,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), clock = Date.now }) {
  if (!nonempty(id) || typeof readExact !== 'function' || typeof search !== 'function' ||
      !Number.isInteger(attempts) || attempts < 1 || attempts > 10 || !Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000) fail('invalid_visibility_probe');
  const start = clock();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const exact = await readExact(id);
    const results = await search(id);
    if (!Array.isArray(results)) fail('invalid_search_response');
    if (exact?.id === id && results.some(row => row.id === id)) return { persisted: true, searchable: true, attempts: attempt, elapsedMs: clock() - start };
    if (attempt === attempts) return { persisted: exact?.id === id, searchable: results.some(row => row.id === id), attempts: attempt, elapsedMs: clock() - start };
    await sleep(delayMs);
  }
}
