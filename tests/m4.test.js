// m4.test.js —— M4 校验与基准（plan/06 M4 DoD + 04 §7/§8/§10）：
//   A. coverage.js 契约：unreachable/tautology/unknown 三类、K-17 试金石（影子在 yes 支路必检出、
//      复合否定分支 unknown、prefix_implied tautology）、JSON/文本双轨、纯函数双跑一致；
//   B. 覆盖率对账：benchmark 12 包 unreachable 12 条 + tautology n5 12 条 recall=1、unknown 如实列出；
//   C. validate.js：绿向（产物自检 + --check 字节比对）、红向（篡改产物 exit 1 / 破坏不变量 exit 1 /
//      缺文件 exit 2 / 缺参数 exit 2）、退出码三语义锁；
//   D. bench.js：全量 12 套件达标 exit 0、--only 白名单、未知套件 exit 2、四类探活逐套件必红（48 组）、
//      门槛随 manifest.thresholds；
//   E. 确定性纪律：coverage/bench/validate 无 Date.now/new Date/Math.random（G4）；冻结件未动（K-12）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, mkdtempSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyze, reportText } from '../src/coverage.js';
import { compileListToTree } from '../src/graph.js';
import { validateRuleset } from '../src/schema.js';
import { extractEmbeddedJson, checkGraphInvariants } from '../tools/validate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = join(ROOT, 'data', 'benchmark');

function listRulesets() {
  return readdirSync(join(BENCH, 'rulesets')).filter((f) => f.endsWith('.json')).sort();
}
function loadRs(f) {
  return JSON.parse(readFileSync(join(BENCH, 'rulesets', f), 'utf8'));
}

// ---------- A. coverage 契约 ----------
test('A1 coverage：benchmark n7 影子（constraint_shadow）→ unreachable_branch n7:yes，恒真 n5 → tautology', () => {
  for (const f of listRulesets()) {
    const rs = loadRs(f);
    const r = analyze(rs, { toTree: compileListToTree });
    const F = r.findings;
    assert.ok(F.unreachable_branch.some((u) => u.node === 'n7' && u.branch === 'yes'), f + ' 必须检出 n7:yes');
    assert.ok(F.tautology.some((t) => t.node === 'n5' && t.branch === 'yes'), f + ' 必须检出 n5:yes 恒真');
    assert.equal(F.unknown.length, 0, f + ' 基准模板无复合条件，unknown 应为空');
  }
});

test('A2 K-17 试金石：复合否定分支不细化 → unknown 显式列出（不折算）', () => {
  const compound = {
    schema_version: '1', ruleset_id: 'litmus-compound', title: '试金石',
    inputs: [{ key: 'x', type: 'number', label: 'X', search_range: [0, 500] }, { key: 't', type: 'enum', label: 'T', values: ['a', 'b'] }],
    verdicts: [{ id: 'V.pass', label: '通过', kind: 'approve' }, { id: 'V.stop', label: '拒绝', kind: 'reject' }],
    root: 'n1',
    nodes: [
      { id: 'n1', label: '复合', condition: { all: [{ field: 'x', op: '>=', value: 60 }, { field: 't', op: '==', value: 'a' }] }, branches: { yes: 'n2', no: 'V.pass' } },
      { id: 'n2', label: '矛盾', condition: { field: 'x', op: '<', value: 30 }, branches: { yes: 'V.stop', no: 'V.pass' } },
    ],
  };
  const r = analyze(compound, { toTree: compileListToTree });
  assert.ok(r.findings.unknown.some((u) => u.node === 'n1' && u.branch === 'no'), '复合否定 → unknown');
  assert.ok(r.findings.unreachable_branch.some((u) => u.node === 'n2' && u.branch === 'yes'), '前缀矛盾仍可判定');
});

test('A3 K-17 试金石：影子条件在 yes 支路（被前缀排除的区间再收紧）→ 必检出 unreachable_branch', () => {
  const shadow = {
    schema_version: '1', ruleset_id: 'litmus-shadow', title: '试金石',
    inputs: [{ key: 'x', type: 'number', label: 'X', search_range: [0, 500] }, { key: 't', type: 'enum', label: 'T', values: ['a', 'b'] }],
    verdicts: [{ id: 'V.pass', label: '通过', kind: 'approve' }, { id: 'V.stop', label: '拒绝', kind: 'reject' }],
    root: 'n1',
    nodes: [
      { id: 'n1', label: '门槛', condition: { field: 'x', op: '<', value: 70 }, branches: { yes: 'V.pass', no: 'n2' } },
      { id: 'n2', label: '影子', condition: { field: 'x', op: '<', value: 30 }, branches: { yes: 'V.stop', no: 'V.pass' } },
    ],
  };
  const r = analyze(shadow, { toTree: compileListToTree });
  assert.ok(r.findings.unreachable_branch.some((u) => u.node === 'n2' && u.branch === 'yes'), 'x≥70 后 x<30 无解');
});

test('A4 coverage list 模式直通 + 双跑一致（纯函数）+ 文本双轨', () => {
  const list = {
    schema_version: '1', ruleset_id: 'litmus-list', title: 'L', mode: 'list', default_verdict: 'V.stop',
    inputs: [{ key: 'x', type: 'number', label: 'X', search_range: [0, 500] }, { key: 't', type: 'enum', label: 'T', values: ['a', 'b'] }],
    verdicts: [{ id: 'V.pass', label: '通过', kind: 'approve' }, { id: 'V.stop', label: '拒绝', kind: 'reject' }],
    rules: [
      { id: 'r1', when: { field: 'x', op: '<', value: 30 }, then: 'V.pass' },
      { id: 'r2', when: { field: 'x', op: '<', value: 20 }, then: 'V.pass' },
    ],
  };
  const r1 = analyze(list, { toTree: compileListToTree });
  const r2 = analyze(list, { toTree: compileListToTree });
  assert.deepEqual(r1, r2);
  assert.ok(r1.findings.unreachable_branch.some((u) => u.node === 'r2' && u.branch === 'yes'), 'list 首命中后 r2 的 yes 支路不可达');
  const text = reportText(r1);
  assert.match(text, /unreachable_branch/);
  assert.match(text, /unknown/);
});

// ---------- B. 覆盖率对账（precision/recall，K-17 诚实口径） ----------
test('B1 覆盖率对账：unreachable 12 条与恒真 n5 12 条 recall=1.0；prefix_implied 恒真额外检出如实登记', () => {
  let unreachableTotal = 0;
  let tautN5 = 0;
  for (const f of listRulesets()) {
    const rs = loadRs(f);
    const vr = validateRuleset(rs);
    assert.equal(vr.ok, true);
    const r = analyze(rs, { toTree: compileListToTree });
    const got = new Set(r.findings.unreachable_branch.map((x) => x.node + ':' + x.branch));
    assert.ok(got.has('n7:yes'), f);
    unreachableTotal++;
    if (r.findings.tautology.some((t) => t.node === 'n5' && t.branch === 'yes')) tautN5++;
  }
  assert.equal(unreachableTotal, 12, '分母 = 12 包（manifest unreachable_branches 合计）');
  assert.equal(tautN5, 12, 'n5 prefix_implied 恒真 12 包全检出');
});

// ---------- C. validate.js（退出码三语义锁，K-1） ----------
test('C1 validate 绿向：产物自检 exit 0 + --check 字节比对 exit 0', () => {
  const rules = join(ROOT, 'data/samples/demo-game.rules.json');
  const caseA = join(ROOT, 'data/samples/demo-game.case.json');
  const out = join(ROOT, '.tmp', 'm4-demo.html');
  mkdirSync(join(ROOT, '.tmp'), { recursive: true });
  const b = spawnSync(process.execPath, [join(ROOT, 'tools', 'atlas.js'), 'build', rules, '--case', caseA, '-o', out], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  const v1 = spawnSync(process.execPath, [join(ROOT, 'tools', 'validate.js'), out], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(v1.status, 0, v1.stderr);
  assert.match(v1.stdout, /VALIDATE_OK/);
  const v2 = spawnSync(process.execPath, [join(ROOT, 'tools', 'validate.js'), rules, out, '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(v2.status, 0, v2.stderr);
  assert.match(v2.stdout, /--check 字节比对/);
  rmSync(out, { force: true });
});

test('C2 validate 红向：篡改产物字节 → exit 1；破坏图不变量 → exit 1', () => {
  const rules = join(ROOT, 'data/samples/demo-game.rules.json');
  const caseA = join(ROOT, 'data/samples/demo-game.case.json');
  const out = join(ROOT, '.tmp', 'm4-demo2.html');
  mkdirSync(join(ROOT, '.tmp'), { recursive: true });
  const b = spawnSync(process.execPath, [join(ROOT, 'tools', 'atlas.js'), 'build', rules, '--case', caseA, '-o', out], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(b.status, 0);
  const html = readFileSync(out, 'utf8');

  const tampered = out.replace('m4-demo2', 'm4-tampered');
  writeFileSync(tampered, html.replace('决策宇宙', '决策字宙'), 'utf8');
  const t = spawnSync(process.execPath, [join(ROOT, 'tools', 'validate.js'), rules, tampered, '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(t.status, 1, '篡改产物 --check 必红');
  assert.match(t.stderr, /脱钩/);
  rmSync(tampered, { force: true });

  const m = html.match(/<script type="application\/json" id="atlas-graph">([\s\S]*?)<\/script>/);
  const g = JSON.parse(m[1]);
  g.nodes[0].yes.to = 'GHOST_NODE';
  const broken = out.replace('m4-demo2', 'm4-broken');
  writeFileSync(broken, html.replace(m[0], m[0].replace(m[1], JSON.stringify(g).replace(/</g, '\\u003c'))), 'utf8');
  const br = spawnSync(process.execPath, [join(ROOT, 'tools', 'validate.js'), broken], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(br.status, 1, '不变量违反必红');
  assert.match(br.stderr, /不变量2/);
  rmSync(broken, { force: true });
  rmSync(out, { force: true });
});

test('C3 validate 用法红向：缺参数 exit 2 / 缺文件 exit 2（K-1 语义锁）', () => {
  const v1 = spawnSync(process.execPath, [join(ROOT, 'tools', 'validate.js')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(v1.status, 2);
  const v2 = spawnSync(process.execPath, [join(ROOT, 'tools', 'validate.js'), join(ROOT, '.tmp', 'no-such.html')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(v2.status, 2);
  const v3 = spawnSync(process.execPath, [join(ROOT, 'tools', 'validate.js'), join(ROOT, 'out', 'demo-game.html'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(v3.status, 2, '--check 无规则集参数 = 用法不可用');
});

test('C4 extractEmbeddedJson + checkGraphInvariants 可独立调用（不变量 1–4）', () => {
  const rules = join(ROOT, 'data/samples/demo-game.rules.json');
  const caseA = join(ROOT, 'data/samples/demo-game.case.json');
  mkdirSync(join(ROOT, '.tmp'), { recursive: true });
  const out = join(ROOT, '.tmp', 'm4-c4.html');
  const b = spawnSync(process.execPath, [join(ROOT, 'tools', 'atlas.js'), 'build', rules, '--case', caseA, '-o', out], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const html = readFileSync(out, 'utf8');
  rmSync(out, { force: true });
  const graph = extractEmbeddedJson(html, 'atlas-graph');
  assert.ok(graph !== null && graph !== undefined);
  assert.equal(checkGraphInvariants(graph, { mode: 'tree', nodes: new Array(graph.nodes.length).fill({}) }).length, 0);
  const broken = { ...graph, nodes: graph.nodes.slice(0, -1) };
  const errs = checkGraphInvariants(broken, undefined);
  assert.ok(errs.some((e) => e.includes('不变量')), '缺节点 → 不变量违反（孤儿或极性）');
});

// ---------- D. bench.js ----------
test('D1 bench 全量：12 套件全达标 exit 0 + BENCH_OK', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'bench.js')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /BENCH_OK 12 suites/);
  assert.match(r.stdout, /SYN-CREDIT-003/);
});

test('D2 bench --only 白名单 + 未知套件 exit 2', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'bench.js'), '--only', 'syn-game-002'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /SYN-GAME-002/);
  assert.doesNotMatch(r.stdout, /SYN-CREDIT/);
  const bad = spawnSync(process.execPath, [join(ROOT, 'tools', 'bench.js'), '--only', 'nope'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /白名单/);
});

test('D3 探活必红：四类缺陷 × 12 套件 = 48 组全部 exit 1', () => {
  const suites = ['syn-enroll-001', 'syn-enroll-002', 'syn-enroll-003', 'syn-reimb-001', 'syn-reimb-002', 'syn-reimb-003',
    'syn-credit-001', 'syn-credit-002', 'syn-credit-003', 'syn-game-001', 'syn-game-002', 'syn-game-003'];
  let red = 0;
  for (const s of suites) {
    for (const kind of ['expect', 'ref', 'boundary', 'unreachable']) {
      const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'bench.js'), '--probe', kind, s], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(r.status, 1, '探活必红失败：' + kind + '/' + s + ' exit=' + r.status + ' stdout=' + r.stdout + ' stderr=' + r.stderr);
      red++;
    }
  }
  assert.equal(red, 48);
});

test('D4 bench 未知探活类型 exit 2（用法语义）', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'bench.js'), '--probe', 'badkind', 'syn-credit-001'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 2);
});

// ---------- E. 确定性纪律 + 冻结件 ----------
test('E1 新增模块无时钟/随机（G4 确定性禁令）', () => {
  for (const rel of ['src/coverage.js', 'tools/validate.js', 'tools/bench.js']) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.doesNotMatch(src, /Date\.now\(/, rel);
    assert.doesNotMatch(src, /new Date\(/, rel);
    assert.doesNotMatch(src, /Math\.random\(/, rel);
  }
});

test('E2 冻结件未动：gen_bench --check 保持 FROZEN_OK（K-12）', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen_bench.js'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /FROZEN_OK/);
});

test('E3 bench 门槛随 manifest.thresholds 下发（数据非代码）', () => {
  const manifest = JSON.parse(readFileSync(join(BENCH, 'manifest.json'), 'utf8'));
  assert.ok(manifest.thresholds !== undefined, 'M4 回填后 manifest 必须携带 thresholds');
  assert.ok(typeof manifest.thresholds.path_accuracy_min === 'number');
});
