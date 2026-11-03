import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRuns } from '../src/evaluate.mjs';
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
