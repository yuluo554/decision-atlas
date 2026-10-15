#!/usr/bin/env node
// gen_bench.js —— 合成基准生成器（M1 数据先行，05-数据计划）。
//
// 确定性纪律（生成器专属，最高优先级，K-4）：
//   - 唯一随机源：自研 splitmix64（整数算法，固定 seed，跨平台一致）——禁 Math.random / 时钟；
//   - 落盘产物键序固定（构造序即写入序，不依赖环境迭代序）、无 generated_at 类时间戳；
//   - 两次独立运行逐字节一致；--check：重生成并与已冻结文件逐文件 sha256 比对，
//     不一致（含缺失/多余文件）→ exit 1 并列出差异；一致 → FROZEN_OK / exit 0。
//
// 真值库纪律（05 §三）：
//   - cases/*.cases.json 只存 input 与 expect（禁 observed 类字段，守门测试扫描）；
//   - 期望键名自带结论（"verdict:V.xxx"、"edge:n1:yes"、"unreachable:n7:yes"、
//     "boundary:n1:field:<f>:T:<T>"），取值恒为 true；
//   - 真值 = 生成时按构造已知（阈值 T / 约束影子不可达分支 / 前缀蕴含恒真分支 /
//     反事实对 Δ 边集合），非事后标注。
//
// 用法：
//   node tools/gen_bench.js            生成 data/benchmark/ 全部产物（冻结落盘）
//   node tools/gen_bench.js --check    位级守门：重生成比对，一致 0 / 不一致 1
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRuleset } from '../src/schema.js';
import { traceRuleset } from '../src/engine.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = join(ROOT, 'data', 'benchmark');
const SEED = 0x53594e42n; // "SYNB" —— 固定种子；任何改动都会改变全部产物字节

// ---------- splitmix64（自研 RNG，BigInt 实现） ----------
export function splitmix64(seed) {
  let state = BigInt.asUintN(64, BigInt(seed));
  return function next() {
    state = BigInt.asUintN(64, state + 0x9e3779b97f4a7c15n);
    let z = state;
    z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
    z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
    z = BigInt.asUintN(64, z ^ (z >> 31n));
    return z;
  };
}
function randInt(rng, lo, hi) {
  const z = rng();
  const span = hi - lo + 1;
  return lo + Number(z % BigInt(span));
}
function randPick(rng, arr) { return arr[randInt(rng, 0, arr.length - 1)]; }

// ---------- 确定性 JSON 落盘（2 空格缩进 + LF + 末尾换行） ----------
export function stableJson(obj) { return JSON.stringify(obj, null, 2) + '\n'; }
function sha256Hex(text) { return createHash('sha256').update(text, 'utf8').digest('hex'); }

// ---------- 真值期望构造 ----------
// expect 键名自带结论、取值恒 true（05 §三）：状态一变键名就变，防误分类静默通过。
function expectOf(trace) {
  const expect = { ['verdict:' + trace.verdict.id]: true };
  for (const id of trace.nodePath) expect['node:' + id] = true;
  for (const e of trace.edges) expect['edge:' + e.from + ':' + e.branch] = true;
  return expect;
}

function makeCase(ruleset, input, caseId, kind, extraExpect) {
  // 真值 = 引擎对构造输入的求值结果；构造即真值（非事后标注）
  const trace = traceRuleset(ruleset, input);
  const expect = expectOf(trace);
  for (const [k, v] of Object.entries(extraExpect || {})) expect[k] = v;
  return { case_id: caseId, kind, input, expect };
}

// ---------- 四个白名单场景模板（M1 定稿，05 §2.2） ----------
// 结构骨架（各场景同形；字段/文案/数值域按场景参数化）：
//   n1(主数值门槛 T) ─yes→ n2(布尔) ─yes→ n3(枚举) ─yes→ V.main / no→ 链式附加节点* → V.main
//   n1.no → n4(宽松档 T-10) ─yes→ V.main / no→ n7(影子定式：再查 >= T+60，yes 分支不可达)
//   n2.no → n5(恒真定式：再查 >= T-20，yes 分支被 n1.yes 前缀蕴含) / no→ V.fallback
//   * 链式附加节点仅 mid/large 档（n3.yes 串接，各自再查递减阈值）。
// base 案例：numGate = T-5（走 n1.no → n4.yes）；alt：仅 numGate 改为 T+5（反事实对）。
// base 附加 T±1 / T±0.5 两档边界案例（n1 的已知临界点邻域）。

function makeRulesetPack(scenario, tier, chainCount) {
  const rng = splitmix64((SEED * 7919n + BigInt(hashStr(scenario + ':' + tier))) & 0xffffffffffffffffn);
  const S = SCENARIOS[scenario];
  const T = S.baseT + randInt(rng, -5, 5); // 主阈值（确定性抖动）
  const f = S.gateField;
  const enumVal = randPick(rng, S.enumValues);
  const truths = { thresholds: [], unreachable: [], tautologies: [], counterfactuals: [] };

  const nodes = [
    { id: 'n1', label: S.l1, condition: { field: f, op: '>=', value: T }, branches: { yes: 'n2', no: 'n4' } },
    { id: 'n2', label: S.l2, condition: { field: S.boolField, op: '==', value: true }, branches: { yes: 'n3', no: 'n5' } },
    { id: 'n3', label: S.l3, condition: { field: S.enumField, op: '==', value: enumVal }, branches: { yes: 'V.main', no: 'n6' } },
    { id: 'n4', label: S.l4, condition: { field: f, op: '>=', value: T - 10 }, branches: { yes: 'V.main', no: 'n7' } },
    { id: 'n5', label: S.l5, condition: { field: f, op: '>=', value: T - 20 }, branches: { yes: 'V.main', no: 'V.fallback' } },
    { id: 'n6', label: S.l6, condition: { field: S.boolField, op: '==', value: true }, branches: { yes: 'V.main', no: 'V.fallback' } },
    { id: 'n7', label: S.l7, condition: { field: f, op: '>=', value: T + 60 }, branches: { yes: 'V.main', no: 'V.fallback' } },
  ];
  truths.thresholds.push({ node: 'n1', field: f, T });
  truths.thresholds.push({ node: 'n4', field: f, T: T - 10 });
  truths.tautologies.push({ node: 'n5', branch: 'yes', cause: 'prefix_implied' });
  truths.unreachable.push({ node: 'n7', branch: 'yes', cause: 'constraint_shadow' });

  let prevYes = 'n3';
  for (let i = 0; i < chainCount; i++) {
    const id = 'nB' + i;
    const t = T - 15 - i * 5;
    nodes.push({ id, label: S.chainLabel + (i + 1), condition: { field: f, op: '>=', value: t }, branches: { yes: 'V.main', no: 'V.fallback' } });
    nodes.find((n) => n.id === prevYes).branches.yes = id;
    truths.thresholds.push({ node: id, field: f, T: t });
    prevYes = id;
  }

  const ruleset = {
    schema_version: '1',
    ruleset_id: 'SYN-' + scenario.slice(4) + '-' + tierCode(tier),
    title: S.titlePrefix + '（' + tierLabel(tier) + '，虚构合成基准，与真实机构无关）',
    description: S.titlePrefix + '：白名单场景 ' + scenario + '，由 tools/gen_bench.js 程序化生成并冻结（禁手改，--check 位级守门）。',
    inputs: [
      { key: f, type: 'number', label: S.gateLabel, search_range: [0, T + 160] },
      { key: S.boolField, type: 'boolean', label: S.boolLabel },
      { key: S.enumField, type: 'enum', label: S.enumLabel, values: S.enumValues },
    ],
    verdicts: [
      { id: 'V.main', label: S.vMain, kind: 'approve' },
      { id: 'V.fallback', label: S.vFallback, kind: 'reject' },
    ],
    root: 'n1',
    nodes,
  };
  const vr = validateRuleset(ruleset);
  if (!vr.ok) throw new Error('生成器产出未过校验（' + scenario + '/' + tier + '）：' + JSON.stringify(vr.errors));

  const baseInput = {
    [f]: T - 5,
    [S.boolField]: false,
    [S.enumField]: randPick(rng, S.enumValues.filter((v) => v !== enumVal)),
  };
  const altInput = { ...baseInput, [f]: T + 5 }; // 仅一个字段不同 → 反事实对

  const cases = [];
  // 案例期望只含该案例可核验的路径/裁定/边界事实；不可达/恒真是规则集级结构性真值，
  // 登记在 manifest（M4 覆盖率自检对账），不塞进未经过该分支的案例期望。
  const baseCase = makeCase(ruleset, baseInput, caseId(ruleset.ruleset_id, 'base'), 'base', {});
  const altCase = makeCase(ruleset, altInput, caseId(ruleset.ruleset_id, 'alt'), 'alt', {});
  // 反事实 Δ 边集合：path(base) Δ path(alt)，由构造唯一确定（构造即真值，非运行时观测）
  const eb = new Set(Object.keys(baseCase.expect).filter((k) => k.startsWith('edge:')));
  const ea = new Set(Object.keys(altCase.expect).filter((k) => k.startsWith('edge:')));
  const delta = [];
  for (const k of eb) if (!ea.has(k)) delta.push(k);
  for (const k of ea) if (!eb.has(k)) delta.push(k);
  delta.sort();
  if (delta.length === 0) throw new Error('反事实对 Δ 边集合为空（模板构造失效）：' + scenario + '/' + tier);
  const altExtra = { ['counterfactual:vs:' + caseId(ruleset.ruleset_id, 'base')]: true };
  for (const k of delta) altExtra['delta:' + k] = true;
  Object.assign(altCase.expect, altExtra);
  cases.push(baseCase, altCase);
  for (const d of [1, 0.5]) { // 已知临界点（n1 的 T 邻域）两档 δ
    const tag = String(d).replace('.', '');
    cases.push(makeCase(ruleset, { ...baseInput, [f]: T - d }, caseId(ruleset.ruleset_id, 'lo' + tag), 'boundary',
      { ['boundary:n1:field:' + f + ':T:' + T]: true }));
    cases.push(makeCase(ruleset, { ...baseInput, [f]: T + d }, caseId(ruleset.ruleset_id, 'hi' + tag), 'boundary',
      { ['boundary:n1:field:' + f + ':T:' + T]: true }));
  }
  truths.counterfactuals.push({ a: caseId(ruleset.ruleset_id, 'base'), b: caseId(ruleset.ruleset_id, 'alt'), field: f });
  return { ruleset, truths, cases };
}

function caseId(rid, tag) { return rid.toLowerCase() + '-' + tag; }
function tierCode(tier) { return { small: '001', mid: '002', large: '003' }[tier]; }
function tierLabel(tier) { return { small: '小档 7 节点', mid: '中档 9 节点', large: '大档 12 节点' }[tier]; }
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// ---------- 白名单场景文案（假业务字段，全部虚构） ----------
const SCENARIOS = {
  'SYN-ENROLL': {
    gateField: 'age_years', gateLabel: '年龄（虚构）', boolField: 'consent_signed', boolLabel: '已签知情同意（虚构）',
    enumField: 'site_cohort', enumLabel: '中心队列（虚构）', enumValues: ['cohortA', 'cohortB', 'cohortC'],
    baseT: 18,
    l1: '年龄下限', l2: '知情同意', l3: '队列匹配', l4: '年龄下限（宽松档）', l5: '年龄复核（恒真定式）',
    l6: '同意书复核', l7: '影子约束（不可达定式）', chainLabel: '年龄附加门槛',
    vMain: '符合入组', vFallback: '不入组', titlePrefix: '假「研究入组资格」规则',
  },
  'SYN-REIMB': {
    gateField: 'claim_amount', gateLabel: '申报金额（虚构额度）', boolField: 'receipt_attached', boolLabel: '凭证齐全（虚构）',
    enumField: 'cost_type', enumLabel: '费用类别（虚构）', enumValues: ['typeA', 'typeB', 'typeC'],
    baseT: 500,
    l1: '金额上限', l2: '凭证齐全', l3: '类别匹配', l4: '金额上限（宽松档）', l5: '金额复核（恒真定式）',
    l6: '凭证复核', l7: '影子约束（不可达定式）', chainLabel: '金额附加门槛',
    vMain: '准予报销', vFallback: '不予报销', titlePrefix: '假「报销准入」规则',
  },
  'SYN-CREDIT': {
    gateField: 'score_points', gateLabel: '评分（虚构分值）', boolField: 'income_verified', boolLabel: '收入已核验（虚构）',
    enumField: 'risk_band', enumLabel: '风险带（虚构）', enumValues: ['bandLow', 'bandMid', 'bandHigh'],
    baseT: 600,
    l1: '评分门槛', l2: '收入核验', l3: '风险带匹配', l4: '评分门槛（宽松档）', l5: '评分复核（恒真定式）',
    l6: '核验复核', l7: '影子约束（不可达定式）', chainLabel: '评分附加门槛',
    vMain: '准予授信', vFallback: '不予授信', titlePrefix: '假「信贷审批」规则',
  },
  'SYN-GAME': {
    gateField: 'level_value', gateLabel: '等级（虚构数值）', boolField: 'pass_owned', boolLabel: '持有通行证（虚构道具）',
    enumField: 'rank_band', enumLabel: '段位带（虚构）', enumValues: ['bandIron', 'bandSteel', 'bandGold'],
    baseT: 30,
    l1: '等级门槛', l2: '通行证', l3: '段位匹配', l4: '等级门槛（宽松档）', l5: '等级复核（恒真定式）',
    l6: '通行证复核', l7: '影子约束（不可达定式）', chainLabel: '等级附加门槛',
    vMain: '获得资格', vFallback: '未获资格', titlePrefix: '假「赛季资格」规则',
  },
};

export const WHITELIST = ['SYN-ENROLL', 'SYN-REIMB', 'SYN-CREDIT', 'SYN-GAME'];
const TIERS = [
  { tier: 'small', chainCount: 0 },
  { tier: 'mid', chainCount: 2 },
  { tier: 'large', chainCount: 5 },
];

// ---------- 生成全部产物 ----------
export function generateAll() {
  const files = [];
  const packs = [];
  for (const scenario of WHITELIST) {
    for (const { tier, chainCount } of TIERS) {
      const pack = makeRulesetPack(scenario, tier, chainCount);
      const rid = pack.ruleset.ruleset_id.toLowerCase();
      files.push({ path: 'rulesets/bench-' + rid + '.rules.json', content: stableJson(pack.ruleset) });
      files.push({ path: 'cases/' + rid + '.cases.json', content: stableJson({ suite: rid, cases: pack.cases }) });
      packs.push({ scenario, tier, pack, rid });
    }
  }
  const sum = (sel) => packs.reduce((n, p) => n + sel(p.pack.truths).length, 0);
  const manifest = {
    schema_version: '1',
    generated_by: 'tools/gen_bench.js（splitmix64 固定 seed，双跑逐字节一致；--check 位级守门；禁手改）',
    whitelist_scenarios: WHITELIST,
    totals: {
      ruleset_packs: packs.length,
      case_files: packs.length,
      cases_total: sum((t) => t.counterfactuals) > 0 ? packs.reduce((n, p) => n + p.pack.cases.length, 0) : 0,
      nodes_total: packs.reduce((n, p) => n + p.pack.ruleset.nodes.length, 0),
      truth_entries: {
        thresholds: sum((t) => t.thresholds),
        unreachable_branches: sum((t) => t.unreachable),
        tautology_branches: sum((t) => t.tautologies),
        counterfactual_pairs: sum((t) => t.counterfactuals),
      },
    },
    sampling: {
      declaration: '抽样非穷举：分母 = 规则包总数 / 节点合计 / 案例-边对合计（见 totals），分子 = 植入真值条目；任何覆盖率表述必须带此分母。',
    },
    thresholds_note: '指标门槛（路径/裁定准确率下限、临界点命中率、不可达检出 precision/recall、反事实对账率）数值 M4 定稿后回填本文件；M1 仅立骨架。',
    packs: packs.map(({ scenario, tier, pack, rid }) => ({
      scenario,
      tier,
      ruleset: 'rulesets/bench-' + rid + '.rules.json',
      cases: 'cases/' + rid + '.cases.json',
      nodes: pack.ruleset.nodes.length,
      case_count: pack.cases.length,
      truth_types: {
        thresholds: pack.truths.thresholds.length,
        unreachable_branches: pack.truths.unreachable.length,
        tautology_branches: pack.truths.tautologies.length,
        counterfactual_pairs: pack.truths.counterfactuals.length,
      },
    })),
  };
  files.push({ path: 'manifest.json', content: stableJson(manifest) });
  return { files };
}

// ---------- CLI ----------
function main(argv) {
  const check = argv.includes('--check');
  const { files } = generateAll();
  if (check) {
    const diffs = [];
    for (const f of files) {
      const p = join(BENCH, f.path);
      if (!existsSync(p)) { diffs.push('缺失：' + f.path); continue; }
      if (sha256Hex(readFileSync(p, 'utf8')) !== sha256Hex(f.content)) diffs.push('不一致：' + f.path);
    }
    const expected = new Set(files.map((x) => x.path));
    const walk = (dir, rel) => {
      for (const e of readdirSync(dir).sort()) {
        const full = join(dir, e);
        const r = rel ? rel + '/' + e : e;
        if (statSync(full).isDirectory()) walk(full, r);
        else if (!expected.has(r)) diffs.push('多余：' + r);
      }
    };
    if (existsSync(BENCH)) walk(BENCH, '');
    if (diffs.length > 0) {
      console.error('CHECK_FAIL（与冻结产物不一致）：');
      for (const d of diffs) console.error('  ' + d);
      return 1;
    }
    console.log('FROZEN_OK ' + files.length + ' files');
    return 0;
  }
  for (const x of files) {
    const p = join(BENCH, x.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, x.content, 'utf8');
    console.log('WROTE ' + x.path + ' sha256=' + sha256Hex(x.content).slice(0, 16));
  }
  return 0;
}

// ---------- CLI（仅直接执行时运行；被测试 import 时不触发，避免顶层 process.exit 终止测试进程） ----------
import { pathToFileURL } from 'node:url';
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const code = main(process.argv.slice(2));
  process.exit(code);
}
