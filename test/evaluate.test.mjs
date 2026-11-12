import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRuns, evaluateVectorSemantics, translateVectorDimension } from '../src/evaluate.mjs';
const row=variant=>({variant,taskId:'resume',trialId:'1',model:'fixture',harnessRevision:'v1',policyRevision:'v1',evidenceRef:'fixture:trace',correct:variant==='memory',falseCompletion:false,unauthorizedAction:false,realmLeak:false,recovered:variant==='memory',latencyMs:20,toolCalls:1,contextTokens:50,costUsd:0});
test('paired scoring reports observed difference without approving adoption',()=>{const r=evaluateRuns({schemaVersion:1,runs:[row('baseline'),row('memory')]});assert.equal(r.correctnessDelta,1);assert.equal(r.adoptionApproved,false);assert.equal(r.runtimeVerified,false);});
test('unpaired, duplicate or confounded trials are rejected',()=>{for(const runs of [[row('memory')],[row('baseline'),row('baseline')],[row('baseline'),{...row('memory'),model:'different'}]]) assert.throws(()=>evaluateRuns({schemaVersion:1,runs}));});
test('safety failures block gate even when task is correct',()=>{const r=evaluateRuns({schemaVersion:1,runs:[row('baseline'),{...row('memory'),realmLeak:true}]});assert.equal(r.safetyGatePassed,false);});
test('missing traces or fabricated unknown costs are not scored as measured zero',()=>{assert.throws(()=>evaluateRuns({schemaVersion:1,runs:[row('baseline'),{...row('memory'),costUsd:null}]}));assert.throws(()=>evaluateRuns({schemaVersion:1,runs:[row('baseline'),{...row('memory'),evidenceRef:''}]}));});
const measured=(variant,tokens,cost,memoryCost=0)=>({...row(variant),correct:true,recovered:true,inputTokens:tokens-10,outputTokens:10,cachedInputTokens:0,tokenSource:'host',costUsd:cost,memoryCostUsd:memoryCost});
test('30 percent target includes output tokens and memory costs',()=>{
  const evaluate=(tokens,cost,memoryCost=0)=>evaluateRuns({schemaVersion:1,runs:[measured('baseline',1000,1),measured('memory',tokens,cost,memoryCost)]}).efficiency;
  assert.equal(evaluate(700,0.7).targetMet,true);
  assert.equal(evaluate(701,0.7).targetMet,false);
  assert.equal(evaluate(700,0.7,0.1).targetMet,false);
  assert.equal(evaluate(700,0.6,0.1).targetMet,true);
});
test('unknown usage and a zero-cost baseline do not establish savings',()=>{
  assert.equal(evaluateRuns({schemaVersion:1,runs:[row('baseline'),row('memory')]}).efficiency.measurementComplete,false);
  const r=evaluateRuns({schemaVersion:1,runs:[measured('baseline',1000,0),measured('memory',500,0)]});
  assert.equal(r.efficiency.totalCostReduction,null);assert.equal(r.efficiency.targetMet,false);
});
test('cheap unsafe or less correct runs cannot meet the efficiency gate',()=>{
  for(const change of [{correct:false},{realmLeak:true},{recovered:false}]) {
    const r=evaluateRuns({schemaVersion:1,runs:[measured('baseline',1000,1),{...measured('memory',100,0.1),...change}]});
    assert.equal(r.efficiency.targetMet,false);
  }
});
test('partial usage and impossible cached token claims fail validation',()=>{
  for(const change of [{inputTokens:undefined},{inputTokens:1.5},{cachedInputTokens:1001},{tokenSource:'estimate'}])
    assert.throws(()=>evaluateRuns({schemaVersion:1,runs:[measured('baseline',1000,1),{...measured('memory',500,0.5),...change}]}));
});

test('vector semantic translation preserves rank correlation, paraphrase margin and non-zero 1536->1024 tail', () => {
  const dim = 1536;
  const makeVec = (freq, phase) => Array.from({ length: dim }, (_, i) => Math.sin((i + 1) * freq + phase) + 0.25 * Math.cos((i + 1) * freq * 0.5));
  const anchor = makeVec(0.017, 0.1);
  const paraphrase = anchor.map((v, i) => v + 0.08 * Math.sin(i * 0.13));
  const hardNegative = makeVec(0.071, 1.9);
  const unrelated = makeVec(0.113, 3.1);

  const shrunk1024 = translateVectorDimension(anchor, 1536, 1024);
  assert.equal(shrunk1024.length, 1024);
  // Regression check for VT-02: indices 768..1023 must NOT be zero-padded
  const tailNonZero = shrunk1024.slice(768).filter(x => Math.abs(x) > 1e-6).length;
  assert.equal(tailNonZero, 256);

  const report = evaluateVectorSemantics({
    vectors: [anchor, paraphrase, hardNegative, unrelated],
    sourceDimension: 1536,
    targetDimensions: [384, 768, 1024, 1536],
    triplets: [{ anchor: 0, positive: 1, negative: 2 }],
    k: 1,
  });
  assert.equal(report.allPassed, true);
  for (const t of report.transitions) {
    assert.ok(t.spearmanRho >= 0.85, `Expected high Spearman rho for ${t.targetDimension}, got ${t.spearmanRho}`);
    assert.equal(t.tailNonZeroRatio, 1);
    assert.ok(t.minTripletMargin > 0.2);
  }
});
