// schema.test.js —— schema 校验器测试（正例 + 反例错误码逐条）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRuleset, validateCase } from '../src/schema.js';
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

function codes(rs) { return validateRuleset(rs).errors.map((e) => e.code); }
function codesCase(rs, c) { return validateCase(rs, c).errors.map((e) => e.code); }

test('样例规则集与案例通过校验', () => {
  const vr = validateRuleset(sampleRuleset());
  assert.deepEqual(vr.errors, []);
  const vc = validateCase(sampleRuleset(), sampleCase());
  assert.deepEqual(vc.errors, []);
});

test('schema_version 错误 → E_SCHEMA_VERSION', () => {
  const rs = sampleRuleset();
  rs.schema_version = '2';
  assert.ok(codes(rs).includes('E_SCHEMA_VERSION'));
});

test('缺 ruleset_id → E_REQUIRED', () => {
  const rs = sampleRuleset();
  delete rs.ruleset_id;
  assert.ok(codes(rs).includes('E_REQUIRED'));
});

test('input key 重复 → E_ID_DUP', () => {
  const rs = sampleRuleset();
  rs.inputs.push({ key: 'level', type: 'number', label: '重复字段' });
  assert.ok(codes(rs).includes('E_ID_DUP'));
});

test('node id 重复 → E_ID_DUP；与裁定冲突 → E_ID_DUP', () => {
  const rs = sampleRuleset();
  rs.nodes[1].id = rs.nodes[0].id;
  assert.ok(codes(rs).includes('E_ID_DUP'));
  const rs2 = sampleRuleset();
  rs2.nodes[0].id = 'V.reject';
  assert.ok(codes(rs2).includes('E_ID_DUP'));
});

test('分支引用悬空 → E_REF', () => {
  const rs = sampleRuleset();
  rs.nodes[0].branches.yes = 'n999';
  assert.ok(codes(rs).includes('E_REF'));
});

test('环 → E_CYCLE', () => {
  const rs = sampleRuleset();
  rs.nodes[3].branches.yes = 'n1'; // n4 →yes n1（n1→n2→n3→n4 已是链，回边成环）
  assert.ok(codes(rs).includes('E_CYCLE'));
});

test('不可达节点 → E_UNREACHABLE', () => {
  const rs = sampleRuleset();
  rs.nodes[0].branches.no = 'V.reject'; // 原本 no → V.reject，不变
  // 构造不可达：加一个新节点且没人指向它
  rs.nodes.push({
    id: 'nX', label: '孤儿', condition: { field: 'level', op: '>', value: 1 },
    branches: { yes: 'V.direct', no: 'V.reject' },
  });
  assert.ok(codes(rs).includes('E_UNREACHABLE'));
});

test('未声明字段 → E_FIELD_UNKNOWN', () => {
  const rs = sampleRuleset();
  rs.nodes[0].condition = { field: 'nope', op: '>', value: 1 };
  assert.ok(codes(rs).includes('E_FIELD_UNKNOWN'));
});

test('算子与类型不符 → E_OP', () => {
  const rs = sampleRuleset();
  rs.nodes[1].condition = { field: 'member', op: '>=', value: true };
  assert.ok(codes(rs).includes('E_OP'));
});

test('枚举值不在 values 内 → E_VALUE；number 条件值类型错 → E_VALUE', () => {
  const rs = sampleRuleset();
  rs.nodes[3].condition = { field: 'tier', op: 'in', value: ['diamond'] };
  assert.ok(codes(rs).includes('E_VALUE'));
  const rs2 = sampleRuleset();
  rs2.nodes[0].condition = { field: 'level', op: '>=', value: '30' };
  assert.ok(codes(rs2).includes('E_VALUE'));
});

test('复合条件空数组 → E_COMPOUND_EMPTY', () => {
  const rs = sampleRuleset();
  rs.nodes[0].condition = { all: [] };
  assert.ok(codes(rs).includes('E_COMPOUND_EMPTY'));
});

test('非 number 带 search_range → E_SEARCH_RANGE；非法区间 → E_SEARCH_RANGE', () => {
  const rs = sampleRuleset();
  rs.inputs[2].search_range = [0, 1];
  assert.ok(codes(rs).includes('E_SEARCH_RANGE'));
  const rs2 = sampleRuleset();
  rs2.inputs[0].search_range = [5, 5];
  assert.ok(codes(rs2).includes('E_SEARCH_RANGE'));
});

test('$default 哨兵缺 default_verdict → E_DEFAULT_MISSING', () => {
  const rs = sampleRuleset();
  rs.nodes[0].branches.yes = '$default';
  assert.ok(codes(rs).includes('E_DEFAULT_MISSING'));
});

test('list 模式 v0 显式拒绝（M2 接入）→ E_MODE', () => {
  const rs = sampleRuleset();
  rs.mode = 'list';
  assert.ok(codes(rs).includes('E_MODE'));
});

test('root 缺失 → E_ROOT_MISSING', () => {
  const rs = sampleRuleset();
  delete rs.root;
  assert.ok(codes(rs).includes('E_ROOT_MISSING'));
});

test('案例缺字段 → E_CASE_MISSING；多字段 → E_CASE_UNKNOWN；类型错/枚举越界 → E_CASE_VALUE', () => {
  const rs = sampleRuleset();
  const c1 = sampleCase();
  delete c1.tier;
  assert.ok(codesCase(rs, c1).includes('E_CASE_MISSING'));
  const c2 = sampleCase();
  c2.extra = 1;
  assert.ok(codesCase(rs, c2).includes('E_CASE_UNKNOWN'));
  const c3 = sampleCase();
  c3.level = '42';
  assert.ok(codesCase(rs, c3).includes('E_CASE_VALUE'));
  const c4 = sampleCase();
  c4.tier = 'diamond';
  assert.ok(codesCase(rs, c4).includes('E_CASE_VALUE'));
});
