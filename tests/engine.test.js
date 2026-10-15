// engine.test.js —— 引擎确定性（G1）与求值语义测试。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceRuleset, evaluateCondition } from '../src/engine.js';
import { canonicalStringify, sha256Hex } from '../src/canonical.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function sampleRuleset() {
  return JSON.parse(readFileSync(join(ROOT, 'data/samples/demo-game.rules.json'), 'utf8'));
}
function sampleCase() {
  return JSON.parse(readFileSync(join(ROOT, 'data/samples/demo-game.case.json'), 'utf8'));
}

test('样例基准案例：走通路径与裁定（手工推演对账）', () => {
  const rs = sampleRuleset();
  const trace = traceRuleset(rs, sampleCase());
  // level 42>=30 → n2；member false → n3；wins 128>=100 → n4；tier gold ∈ {silver,gold} → V.playoff
  assert.deepEqual(trace.nodePath, ['n1', 'n2', 'n3', 'n4']);
  assert.equal(trace.verdict.id, 'V.playoff');
  assert.deepEqual(trace.edges, [
    { from: 'n1', branch: 'yes', to: 'n2' },
    { from: 'n2', branch: 'no', to: 'n3' },
    { from: 'n3', branch: 'yes', to: 'n4' },
  ]);
});

test('分支切换：等级不足 → V.reject；会员直通 → V.direct', () => {
  const rs = sampleRuleset();
  const t1 = traceRuleset(rs, { level: 10, wins: 128, member: false, tier: 'gold' });
  assert.equal(t1.verdict.id, 'V.reject');
  const t2 = traceRuleset(rs, { level: 42, wins: 0, member: true, tier: 'bronze' });
  assert.equal(t2.verdict.id, 'V.direct');
  assert.deepEqual(t2.nodePath, ['n1', 'n2']);
});

test('求值确定性：同输入双跑 canonical sha256 相等（G1）', () => {
  const rs = sampleRuleset();
  const c = sampleCase();
  const h1 = sha256Hex(canonicalStringify(traceRuleset(rs, c)));
  const h2 = sha256Hex(canonicalStringify(traceRuleset(rs, c)));
  assert.equal(h1, h2);
});

test('算子语义抽查（原子条件）', () => {
  const v = { a: 5, b: true, s: 'x', e: 'p' };
  assert.equal(evaluateCondition({ field: 'a', op: '>', value: 3 }, v), true);
  assert.equal(evaluateCondition({ field: 'a', op: '<=', value: 5 }, v), true);
  assert.equal(evaluateCondition({ field: 'a', op: '!=', value: 5 }, v), false);
  assert.equal(evaluateCondition({ field: 'b', op: '==', value: true }, v), true);
  assert.equal(evaluateCondition({ field: 's', op: '==', value: 'x' }, v), true);
  assert.equal(evaluateCondition({ field: 'e', op: 'not_in', value: ['q', 'r'] }, v), true);
});

test('复合条件：all/any 递归', () => {
  const v = { a: 5, b: 1 };
  assert.equal(evaluateCondition({ all: [{ field: 'a', op: '>=', value: 3 }, { field: 'b', op: '>=', value: 3 }] }, v), false);
  assert.equal(evaluateCondition({ any: [{ field: 'a', op: '>=', value: 3 }, { field: 'b', op: '>=', value: 3 }] }, v), true);
  assert.equal(evaluateCondition({ all: [{ field: 'a', op: '>=', value: 3 }, { any: [{ field: 'b', op: '>=', value: 3 }, { field: 'b', op: '<', value: 2 }] }] }, v), true);
});

test('$default 哨兵解析', () => {
  const rs = {
    schema_version: '1', ruleset_id: 'T-1', title: 't',
    inputs: [{ key: 'x', type: 'number', label: 'x' }],
    verdicts: [
      { id: 'V.hi', label: 'hi', kind: 'approve' },
      { id: 'V.other', label: 'other', kind: 'reject' },
    ],
    root: 'n1',
    nodes: [{ id: 'n1', condition: { field: 'x', op: '>=', value: 10 }, branches: { yes: 'V.hi', no: '$default' } }],
    default_verdict: 'V.other',
  };
  const t1 = traceRuleset(rs, { x: 20 });
  assert.equal(t1.verdict.id, 'V.hi');
  const t2 = traceRuleset(rs, { x: 1 });
  assert.equal(t2.verdict.id, 'V.other');
});
