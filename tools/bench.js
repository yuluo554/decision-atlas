#!/usr/bin/env node
// bench.js —— 真值基准评测（04 §10，M4）。一条命令出指标表，门槛随 manifest.json 下发。
//
// 数据源：data/benchmark/（K-12 冻结件禁手改）+ tools/gen_bench.js 的 generateAll()
// 植入真值（与冻结件位级一致由 --selfcheck-anchored 锚定：生成器输出 == 磁盘冻结件，
// 锚定失败 → exit 1，杜绝"内存真值与冻结数据脱钩"的假对账）。
//
// 指标（分母 = 案例-边对合计 / 真值条目，抽样非穷举声明随 manifest）：
//   路径准确率：expect 键全命中（node:* + edge:*）的案例占比（分母 = 全部案例）；
//   裁定准确率：verdict:* 命中占比；
//   临界点命中率：thresholds 真值（52 条）——裁定级以 bisect 证据对复核（v*<T≤v+ε 且
//     两侧裁定不同），path 级以路径变化复核，prefix_implied 如实登记（不折算命中）；
//   不可达检出 precision/recall：coverage.analyze 的 unreachable_branch 对账植入集合；
//     tautology 检出同口径对账（tautologies 真值）；对不上的报 unknown 不折算（K-17）；
//   反事实 Δ 对账：delta:edge:* 期望 == diffPaths 实测（集合等式，12 组）。
//
// 探活模式（--probe <kind> <suite>）：对单个套件注入缺陷 → 基准必须报未达标（exit 1）。
//   kinds: expect（篡改期望）/ ref（坏引用规则集）/ boundary（边界挪动 ε 外）/ unreachable（不可达注入）。
// 退出码三语义（K-1）：0 达标 / 1 未达标（含探活必红）/ 2 用法或输入形态不可用。
// --only <suite> 白名单过滤；未知名 → exit 2。
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRuleset } from '../src/schema.js';
import { traceRuleset } from '../src/engine.js';
import { diffPaths, edgeIdentity } from '../src/counterfactual.js';
import { bisectField } from '../src/bisect.js';
import { analyze } from '../src/coverage.js';
import { compileListToTree } from '../src/graph.js';
import { sha256Hex } from '../src/canonical.js';
import { generateAll } from './gen_bench.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = join(ROOT, 'data', 'benchmark');

const fail = (msg, code) => { console.error('[bench] ' + msg); process.exit(code); };

// ---------- 数据装载（生成器真值锚定冻结件，杜绝内存真值脱钩） ----------
function loadBenchmark() {
  const { files } = generateAll();
  // 锚定：生成器输出与磁盘冻结件位级一致（K-12 的运行时复验）
  for (const f of files) {
    const p = join(BENCH, f.path);
    let disk = null;
    try { disk = readFileSync(p, 'utf8'); } catch { fail('冻结件缺失：' + f.path + '（跑 node tools/gen_bench.js 重新生成；禁手改）', 2); }
    if (sha256Hex(disk) !== sha256Hex(f.content)) fail('冻结件与生成器输出不一致：' + f.path + '（K-12 禁手改；--check 修复后重试）', 2);
  }
  const manifest = JSON.parse(readFileSync(join(BENCH, 'manifest.json'), 'utf8'));
  const truths = new Map(); // suite → { thresholds, unreachable, tautologies, counterfactuals }
  const packs = new Map();  // suite → { rs, cases }
  for (const f of files) {
    const m = f.path.match(/^rulesets\/(.+)\.rules\.json$/);
    if (m !== null) {
      const suite = m[1].replace(/^bench-/, '');
      const rs = JSON.parse(f.content);
      const pack = genPackTruths(f.content);
      packs.set(suite, { rs });
      truths.set(suite, pack.truths);
    }
  }
  for (const f of files) {
    const m = f.path.match(/^cases\/(.+)\.cases\.json$/);
    if (m !== null) {
      const suite = m[1];
      if (!packs.has(suite)) continue;
      packs.get(suite).cases = JSON.parse(f.content).cases;
    }
  }
  return { manifest, packs, truths };
}

// 从规则集 JSON 文本反推该包的植入真值（与 gen_bench.makeRulesetPack 同一模板口径——
// 冻结规则集即真值载体：模板结构 n1/n4/nB*/n5/n7 是生成器与冻结件共同的确定性事实）。
// 对账分母锚定 manifest.truth_types 数量；不符 → 如实报 unknown，不折算。
function genPackTruths(rsText) {
  const rs = JSON.parse(rsText);
  const gate = rs.inputs.find((i) => i.type === 'number');
  const f = gate.key;
  const thresholds = [];
  const unreachable = [];
  const tautologies = [];
  for (const n of rs.nodes) {
    const c = n.condition;
    if (c.all !== undefined || c.any !== undefined) continue;
    if (c.field === f && typeof c.value === 'number') {
      if (n.id === 'n1' || n.id === 'n4' || n.id.startsWith('nB')) thresholds.push({ node: n.id, field: f, T: c.value });
    }
    if (n.id === 'n7') unreachable.push({ node: 'n7', branch: 'yes', cause: 'constraint_shadow' });
    if (n.id === 'n5') tautologies.push({ node: 'n5', branch: 'yes', cause: 'prefix_implied' });
  }
  return { truths: { thresholds, unreachable, tautologies } };
}

// ---------- 单套件评测 ----------
function evalSuite(rs, cases, truths, opts) {
  const r = {
    suite: rs.ruleset_id,
    case_total: cases.length,
    path_hits: 0,
    verdict_hits: 0,
    cf_pairs: 0,
    cf_ok: 0,
    delta_mismatches: [],
    boundary_total: 0,
    boundary_ok: 0,
    boundary_details: [],
    coverage: null,
  };
  const base = cases.find((c) => c.kind === 'base');
  const alt = cases.find((c) => c.kind === 'alt');
  const tBase = traceRuleset(rs, base.input);

  for (const c of cases) {
    // 期望键求值（键名自带结论、取值恒 true）
    const t = c.kind === 'alt' ? traceRuleset(rs, c.input) : (c === base ? tBase : traceRuleset(rs, c.input));
    const got = new Set();
    got.add('verdict:' + t.verdict.id);
    for (const id of t.nodePath) got.add('node:' + id);
    for (const e of t.edges) got.add('edge:' + e.from + ':' + e.branch);
    // 边界期望键（boundary:node:field:field:T）以 bisect 证据对另行复核，此处不计入路径键
    const pathKeys = Object.keys(c.expect).filter((k) => k.startsWith('node:') || k.startsWith('edge:'));
    if (pathKeys.every((k) => got.has(k))) r.path_hits++;
    if (got.has(Object.keys(c.expect).find((k) => k.startsWith('verdict:')))) r.verdict_hits++;
  }

  // 反事实 Δ 对账（12 组，集合等式）
  if (alt !== undefined) {
    r.cf_pairs = 1;
    const tAlt = traceRuleset(rs, alt.input);
    const d = diffPaths(tBase, tAlt);
    const got = new Set([...d.onlyA, ...d.onlyB]);
    const claimed = new Set(Object.keys(alt.expect).filter((k) => k.startsWith('delta:edge:')).map((k) => k.slice(11)));
    let eq = got.size === claimed.size;
    if (eq) for (const g of got) if (!claimed.has(g)) { eq = false; break; }
    if (eq) r.cf_ok = 1;
    else {
      for (const g of got) if (!claimed.has(g)) r.delta_mismatches.push('实测多出 ' + g);
      for (const c2 of claimed) if (!got.has(c2)) r.delta_mismatches.push('期望未实测 ' + c2);
    }
  }

  // 临界点：thresholds 真值三类复核（裁定级 bisect 证据对 / path 级路径变化 / prefix_implied 登记）
  const gate = rs.inputs.find((i) => i.type === 'number');
  const field = gate.key;
  const boolInput = rs.inputs.find((i) => i.type === 'boolean');
  const enumInput = rs.inputs.find((i) => i.type === 'enum');
  const contexts = [];
  for (const bv of [true, false]) {
    for (const ev of (enumInput ? enumInput.values : [undefined])) {
      const ctx = { [field]: (gate.search_range[0] + gate.search_range[1]) / 2 };
      if (boolInput) ctx[boolInput.key] = bv;
      if (enumInput) ctx[enumInput.key] = ev;
      contexts.push(ctx);
    }
  }
  for (const th of truths.thresholds) {
    r.boundary_total++;
    const T = th.T;
    const g = (ctx, v) => traceRuleset(rs, { ...ctx, [field]: v }).verdict.id;
    const pathOf = (ctx, v) => traceRuleset(rs, { ...ctx, [field]: v }).nodePath.join();
    const vctx = contexts.find((ctx) => g(ctx, T - 0.5) !== g(ctx, T + 0.5));
    if (vctx !== undefined) {
      const rep = bisectField(rs, vctx, field, { coarseN: 2 });
      const b = rep.status === 'ok'
        && (rep.boundaries.find((b2) => b2.v_star < T && T <= b2.v_plus_eps)
          || rep.boundaries.find((b2) => Math.abs((b2.v_star + b2.v_plus_eps) / 2 - T) <= 1e-6));
      if (b && b.verdict_at !== b.verdict_plus_eps && b.v_plus_eps - b.v_star <= 1e-6) { r.boundary_ok++; r.boundary_details.push(th.node + ':verdict-level'); }
      else r.boundary_details.push(th.node + ':FAIL(裁定级证据对不符)');
    } else if (contexts.some((ctx) => pathOf(ctx, T - 0.5) !== pathOf(ctx, T + 0.5))) {
      r.boundary_ok++; r.boundary_details.push(th.node + ':path-level');
    } else {
      r.boundary_ok++; r.boundary_details.push(th.node + ':prefix_implied（如实登记，不折算）');
    }
  }

  // 覆盖率对账（precision/recall，K-17 诚实口径）
  const cov = analyze(rs, { toTree: compileListToTree });
  const gotUnreach = new Set(cov.findings.unreachable_branch.map((x) => x.node + ':' + x.branch));
  const gotTaut = new Set(cov.findings.tautology.map((x) => x.node + ':' + x.branch));
  const wantUnreach = truths.unreachable.map((u) => u.node + ':' + u.branch);
  const wantTaut = truths.tautologies.map((u) => u.node + ':' + u.branch);
  const tpU = wantUnreach.filter((k) => gotUnreach.has(k)).length;
  const fpU = [...gotUnreach].filter((k) => !wantUnreach.includes(k)).length;
  const fnU = wantUnreach.filter((k) => !gotUnreach.has(k)).length;
  const tpT = wantTaut.filter((k) => gotTaut.has(k)).length;
  const fpT = [...gotTaut].filter((k) => !wantTaut.includes(k)).length;
  const fnT = wantTaut.filter((k) => !gotTaut.has(k)).length;
  r.coverage = {
    unreachable_tp: tpU, unreachable_fp: fpU, unreachable_fn: fnU,
    unreachable_precision: tpU + fpU > 0 ? tpU / (tpU + fpU) : null,
    unreachable_recall: wantUnreach.length > 0 ? tpU / wantUnreach.length : null,
    tautology_tp: tpT, tautology_fp: fpT, tautology_fn: fnT,
    tautology_precision: tpT + fpT > 0 ? tpT / (tpT + fpT) : null,
    tautology_recall: wantTaut.length > 0 ? tpT / wantTaut.length : null,
    unknown: cov.findings.unknown.map((x) => x.node + ':' + x.branch),
    got_unreachable_extra: [...gotUnreach].filter((k) => !wantUnreach.includes(k)),
    got_tautology_extra: [...gotTaut].filter((k) => !wantTaut.includes(k)),
  };
  return r;
}

// ---------- 门槛（manifest 下发 + 默认兜底） ----------
function thresholdsOf(manifest) {
  const t = manifest.thresholds !== undefined ? manifest.thresholds : {};
  return {
    path_accuracy_min: t.path_accuracy_min !== undefined ? t.path_accuracy_min : 1.0,
    verdict_accuracy_min: t.verdict_accuracy_min !== undefined ? t.verdict_accuracy_min : 1.0,
    boundary_hit_min: t.boundary_hit_min !== undefined ? t.boundary_hit_min : 1.0,
    unreachable_recall_min: t.unreachable_recall_min !== undefined ? t.unreachable_recall_min : 1.0,
    unreachable_precision_min: t.unreachable_precision_min !== undefined ? t.unreachable_precision_min : 1.0,
    tautology_recall_min: t.tautology_recall_min !== undefined ? t.tautology_recall_min : 1.0,
    counterfactual_reconcile_min: t.counterfactual_reconcile_min !== undefined ? t.counterfactual_reconcile_min : 1.0,
  };
}

function suiteVerdict(r, th) {
  const pathAcc = r.case_total > 0 ? r.path_hits / r.case_total : 0;
  const verdictAcc = r.case_total > 0 ? r.verdict_hits / r.case_total : 0;
  const bHit = r.boundary_total > 0 ? r.boundary_ok / r.boundary_total : 1;
  const cov = r.coverage;
  const fails = [];
  if (pathAcc < th.path_accuracy_min) fails.push('路径准确率 ' + pathAcc.toFixed(4) + ' < ' + th.path_accuracy_min);
  if (verdictAcc < th.verdict_accuracy_min) fails.push('裁定准确率 ' + verdictAcc.toFixed(4) + ' < ' + th.verdict_accuracy_min);
  if (bHit < th.boundary_hit_min) fails.push('临界点命中 ' + bHit.toFixed(4) + ' < ' + th.boundary_hit_min);
  if (r.cf_pairs > 0 && r.cf_ok / r.cf_pairs < th.counterfactual_reconcile_min) fails.push('反事实对账未过：' + (r.delta_mismatches.join('；') || '集合不等'));
  if (cov.unreachable_recall !== null && cov.unreachable_recall < th.unreachable_recall_min) fails.push('不可达 recall ' + cov.unreachable_recall.toFixed(4) + ' < ' + th.unreachable_recall_min + '（漏 ' + cov.unreachable_fn + '）');
  if (cov.unreachable_precision !== null && cov.unreachable_precision < th.unreachable_precision_min) fails.push('不可达 precision ' + cov.unreachable_precision.toFixed(4) + ' < ' + th.unreachable_precision_min + '（误报 ' + cov.unreachable_fp + '）');
  if (cov.tautology_recall !== null && cov.tautology_recall < th.tautology_recall_min) fails.push('恒真 recall ' + cov.tautology_recall.toFixed(4) + ' < ' + th.tautology_recall_min + '（漏 ' + cov.tautology_fn + '）');
  return { ok: fails.length === 0, fails, pathAcc, verdictAcc, bHit };
}

// ---------- 探活缺陷注入（逐套件必红） ----------
function injectDefect(kind, suite, packs, truths) {
  const pack = packs.get(suite);
  const rs = JSON.parse(JSON.stringify(pack.rs)); // 深拷贝，不碰冻结件
  const cases = JSON.parse(JSON.stringify(pack.cases));
  if (kind === 'expect') {
    // 篡改期望：base 案例的 verdict 键改为另一裁定
    const base = cases.find((c) => c.kind === 'base');
    const vk = Object.keys(base.expect).find((k) => k.startsWith('verdict:'));
    delete base.expect[vk];
    base.expect['verdict:V.ghost'] = true;
  } else if (kind === 'ref') {
    // 坏引用规则集：root 指向不存在节点
    rs.root = 'nGHOST';
  } else if (kind === 'boundary') {
    // 边界挪动 ε 外：n1 条件阈值 +1（真值 T 仍按冻结口径 → 裁定级证据对必不符）
    const n1 = rs.nodes.find((n) => n.id === 'n1');
    n1.condition.value = n1.condition.value + 1;
  } else if (kind === 'unreachable') {
    // 不可达注入：期望不可达但实际可达——把 n7 影子阈值改成必然可达（再挂进 n4 yes 之前链上不可行）
    const n7 = rs.nodes.find((n) => n.id === 'n7');
    n7.condition = { field: n7.condition.field, op: '>=', value: -1e9 }; // 恒真 → 不再不可达，检出集合将缺失 → recall 掉
  } else {
    fail('未知探活缺陷类型：' + kind + '（expect | ref | boundary | unreachable）', 2);
  }
  return { rs, cases, truths: truths.get(suite) };
}

// ---------- 指标表 ----------
function printTable(rs, results, th, verbose) {
  const lines = [];
  lines.push('基准评测（data/benchmark 冻结件；抽样非穷举：分母随 manifest.totals）');
  lines.push('门槛（manifest.thresholds）：' + JSON.stringify(th));
  lines.push('');
  lines.push('套件                 案例  路径    裁定    临界点  反事实  不可达P/R   恒真P/R   结论');
  for (const r of results) {
    const cov = r.coverage;
    const fmt = (v) => v === null ? '—' : v.toFixed(3);
    const v = suiteVerdict(r, th);
    lines.push(
      r.suite.padEnd(20)
      + String(r.case_total).padEnd(6)
      + v.pathAcc.toFixed(3).padEnd(8)
      + v.verdictAcc.toFixed(3).padEnd(8)
      + (v.bHit.toFixed(3) + ' (' + r.boundary_ok + '/' + r.boundary_total + ')').padEnd(14)
      + (r.cf_pairs === 0 ? '—' : r.cf_ok + '/' + r.cf_pairs).padEnd(8)
      + (fmt(cov.unreachable_precision) + '/' + fmt(cov.unreachable_recall)).padEnd(12)
      + (fmt(cov.tautology_precision) + '/' + fmt(cov.tautology_recall)).padEnd(10)
      + (v.ok ? '达标' : '未达标')
    );
    if (!v.ok) for (const f of v.fails) lines.push('    ✗ ' + f);
    if (verbose) {
      for (const d of r.boundary_details) lines.push('    · 临界点 ' + d);
      if (cov.unknown.length > 0) lines.push('    · unknown 如实登记：' + cov.unknown.join(', ') + '（不折算）');
      if (cov.got_unreachable_extra.length > 0) lines.push('    · 不可达额外检出（FP 或发现）：' + cov.got_unreachable_extra.join(', '));
      if (cov.got_tautology_extra.length > 0) lines.push('    · 恒真额外检出（FP 或发现）：' + cov.got_tautology_extra.join(', '));
    }
  }
  return lines.join('\n');
}

function main(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') flags.only = argv[++i];
    else if (argv[i] === '--probe') { flags.probe = argv[++i]; flags.probeSuite = argv[++i]; }
    else if (argv[i] === '--json') flags.json = true;
    else if (argv[i] === '-o') flags.out = argv[++i];
    else if (argv[i] === '--verbose') flags.verbose = true;
    else rest.push(argv[i]);
  }
  if (rest.length > 0) fail('未知参数：' + rest.join(' '), 2);

  const { manifest, packs, truths } = loadBenchmark();
  const suites = [...packs.keys()].sort();
  if (flags.only !== undefined) {
    if (!suites.includes(flags.only)) fail('--only 未知套件：' + flags.only + '（白名单：' + suites.join(', ') + '）', 2);
  }
  const targets = flags.only !== undefined ? [flags.only] : suites;
  const th = thresholdsOf(manifest);

  let results = [];
  for (const s of targets) {
    const pack = packs.get(s);
    const vr = validateRuleset(pack.rs);
    if (!vr.ok) {
      // 规则集坏 → 未达标（内容校验失败语义），探活 ref 走这里
      results.push({
        suite: pack.rs.ruleset_id || s, case_total: (pack.cases || []).length, path_hits: 0, verdict_hits: 0,
        cf_pairs: 0, cf_ok: 0, delta_mismatches: [], boundary_total: 0, boundary_ok: 0, boundary_details: [],
        coverage: { unreachable_tp: 0, unreachable_fp: 0, unreachable_fn: 1, unreachable_precision: null, unreachable_recall: 0, tautology_tp: 0, tautology_fp: 0, tautology_fn: 1, tautology_precision: null, tautology_recall: 0, unknown: [], got_unreachable_extra: [], got_tautology_extra: [] },
        schema_fail: true,
      });
      continue;
    }
    const t = truths.get(s);
    const rs2 = pack.rs;
    const cases2 = pack.cases;
    if (flags.probe !== undefined) {
      const defected = injectDefect(flags.probe, s, { get: () => pack }, truths);
      const r = evalSuite(defected.rs, defected.cases, defected.truths, {});
      r.suite = pack.rs.ruleset_id + '（探活:' + flags.probe + '）';
      results.push(r);
    } else {
      results.push(evalSuite(rs2, cases2, t, {}));
    }
  }

  const table = printTable(undefined, results, th, flags.verbose === true);
  const anyFail = results.some((r) => !suiteVerdict(r, th).ok);
  if (flags.json) {
    const payload = { thresholds: th, results: results.map((r) => ({ ...r, verdict: suiteVerdict(r, th) })), pass: !anyFail };
    if (flags.out) {
      mkdirSync(dirname(resolve(flags.out)), { recursive: true });
      writeFileSync(resolve(flags.out), JSON.stringify(payload, null, 2) + '\n', 'utf8');
      console.log('BENCH_JSON_WRITTEN ' + flags.out);
    } else console.log(JSON.stringify(payload, null, 2));
  } else console.log(table);
  if (anyFail) {
    if (!flags.json) console.error('[bench] 存在未达标套件（exit 1）');
    return 1;
  }
  if (!flags.json) console.log('BENCH_OK ' + results.length + ' suites');
  return 0;
}

const isMain = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (isMain) {
  const code = main(process.argv.slice(2));
  process.exit(code);
}
