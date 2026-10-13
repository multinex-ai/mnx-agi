import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRuns } from '../src/evaluate.mjs';
const row=variant=>({variant,taskId:'resume',trialId:'1',model:'fixture',harnessRevision:'v1',policyRevision:'v1',evidenceRef:'fixture:trace',correct:variant==='memory',falseCompletion:false,unauthorizedAction:false,realmLeak:false,recovered:variant==='memory',latencyMs:20,toolCalls:1,contextTokens:50,costUsd:0});
test('paired scoring reports observed difference without approving adoption',()=>{const r=evaluateRuns({schemaVersion:1,runs:[row('baseline'),row('memory')]});assert.equal(r.correctnessDelta,1);assert.equal(r.adoptionApproved,false);assert.equal(r.runtimeVerified,false);});
test('unpaired, duplicate or confounded trials are rejected',()=>{for(const runs of [[row('memory')],[row('baseline'),row('baseline')],[row('baseline'),{...row('memory'),model:'different'}]]) assert.throws(()=>evaluateRuns({schemaVersion:1,runs}));});
test('safety failures block gate even when task is correct',()=>{const r=evaluateRuns({schemaVersion:1,runs:[row('baseline'),{...row('memory'),realmLeak:true}]});assert.equal(r.safetyGatePassed,false);});
test('missing traces or fabricated unknown costs are not scored as measured zero',()=>{assert.throws(()=>evaluateRuns({schemaVersion:1,runs:[row('baseline'),{...row('memory'),costUsd:null}]}));assert.throws(()=>evaluateRuns({schemaVersion:1,runs:[row('baseline'),{...row('memory'),evidenceRef:''}]}));});
