// Offline planning only. Supplied scope/capability declarations never grant access.
const capabilities = ['identity','hydrate','retrieve','episode','associate','checkpoint','write','reflect','consolidate','reinforce','predict','sharedSearch'];
const signals = ['materialGap','chronology','blocked','verifiedOutcome','novelLesson','checkpointDue','contextPressure','contradictions','predictionUseful','sharedKnowledgeAllowed','independentReuse'];
export function planMemory(input) {
  const fail = () => { throw new Error('Invalid memory-plan input; see docs/MEMORY_WORKFLOWS.md'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  if (Object.keys(input).some(k => !['task','scope','capabilities','signals','maxCalls'].includes(k))) fail();
  if (!['simple','research','build','debug','resume'].includes(input.task) || !['unknown','mismatch','matched'].includes(input.scope)) fail();
  if (!Array.isArray(input.capabilities) || input.capabilities.some(c => !capabilities.includes(c)) || new Set(input.capabilities).size !== input.capabilities.length) fail();
  if (!input.signals || typeof input.signals !== 'object' || Array.isArray(input.signals) || Object.entries(input.signals).some(([k,v]) => !signals.includes(k) || typeof v !== 'boolean')) fail();
  if (!Number.isInteger(input.maxCalls) || input.maxCalls < 0 || input.maxCalls > 24) fail();
  const steps = [], deferred = [], s = input.signals;
  const result = { schemaVersion: 1, advisoryOnly: true, runtimeVerified: false, steps, deferred, protectedAccess: 'not-authorized-by-plan', maxCalls: input.maxCalls };
  const add = (capability, reason, condition = 'needed') => {
    if (!input.capabilities.includes(capability)) { deferred.push({ capability, reason: 'unavailable' }); return; }
    if (steps.length >= input.maxCalls) { deferred.push({ capability, reason: 'call-budget' }); return; }
    steps.push({ capability, reason, condition, maxCalls: 1, executionGate: capability === 'identity' ? 'inspect-service-scope-without-private-payload' : 'reverify-identity-namespace-permission-and-live-schema' });
  };
  if (input.task === 'simple' && !s.checkpointDue) { result.localAction = 'Use current task evidence; no automatic memory calls'; return result; }
  if (input.scope !== 'matched') {
    if (input.scope === 'unknown') add('identity','Establish actual account and namespace before protected access');
    result.localAction = 'Pause protected access; continue independent local work; replan after verified binding';
    return result;
  }
  // Recovery takes priority over optional enrichment or learning.
  if (s.checkpointDue || s.contextPressure) add('checkpoint','Preserve exact acceptance state and artifact references','authorized-write-with-receipt; use approved local checkpoint if unavailable');
  if (input.task === 'resume' || s.materialGap) add('hydrate','Load compact objective-relevant context');
  if (s.materialGap || s.contradictions || input.task === 'debug') add('retrieve',s.contradictions ? 'Find original and contrary sources; retain unresolved conflict' : 'Find task-relevant facts, procedures and known failures');
  if (s.chronology) add('episode','Recover event ordering using known episode/task references','chronology-still-unresolved-after-compact-context');
  if (s.blocked && input.task !== 'simple') add('associate','Expand around the specific failure or source','targeted-retrieval-did-not-resolve-gap');
  if (s.sharedKnowledgeAllowed && s.materialGap) add('sharedSearch','Search permitted reusable knowledge','separate-shared-scope-authorization; no-private-query-payload');
  if (s.predictionUseful) add('predict','Generate a falsifiable risk hypothesis','remaining-material-uncertainty; never-treat-as-evidence');
  if (s.verifiedOutcome && s.novelLesson) {
    add('write','Persist a selected useful result with source and supersession references','authorized-write; deduplicate-first; reconcile-ambiguous-receipt');
    add('reflect','Derive a candidate lesson from the observed result','evidence-linked; retain-counterexamples; no-policy-amendment');
  }
  if (s.verifiedOutcome && s.independentReuse) add('reinforce','Record independent evidence of successful reuse','verify-independent-source; never-repeat-text-to-boost-ranking');
  if (s.verifiedOutcome && s.contradictions) add('consolidate','Reconcile competing records without erasing provenance','explicit-mutation-scope; source-conflict-resolved; preserve-unresolved-claims');
  result.localAction = 'Execute only still-useful supported steps; stop retrieval when evidence is sufficient; verify the actual task independently';
  return result;
}
