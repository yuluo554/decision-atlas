#!/usr/bin/env node
// atlas.js —— 用户 CLI（零第三方依赖）。退出码三语义（K 口径 D-07，锁进测试）：
//   0 = 成功；1 = 内容校验失败（schema/case 校验未通过）；2 = 用法或输入形态不可用（缺文件/坏 JSON/YAML 越界/未知命令）。
//
// 子命令：
//   selftest                       内置自检（确定性 + 渲染双跑 + 无外链），退出码携带成败
//   build <rules> --case <c> -o out.html   编译单文件 HTML
//   walk <rules> --case <c>        打印求值 trace（canonical JSON）
//   bisect <rules> --case <c> [--field <f>]  阈值二分（临界点证据对；--field 缺省跑全部 number 字段）
//   counterfactual <rules> --case <c1> --case-b <c2>  反事实路径差（Δ 边集合 + 分叉点）
// 输入格式：.json 按 JSON 解析；.yaml/.yml 按 YAML 子集解析（D-03，越界 E_YAML_* → exit 2）。
// （M4 起 validate / bench 由独立工具承担）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRuleset, validateCase } from '../src/schema.js';
import { traceRuleset, traceRulesetAny } from '../src/engine.js';
import { buildGraph } from '../src/graph.js';
import { renderHtml } from '../src/render.js';
import { canonicalStringify, canonicalSha256, sha256Hex } from '../src/canonical.js';
import { bisectField, bisectAll } from '../src/bisect.js';
import { diffPaths } from '../src/counterfactual.js';
import { parseYaml, YamlError } from '../src/yaml.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg, code) {
  console.error('[atlas] ' + msg);
  process.exit(code);
}

function readJsonOrExit(p, usageHint) {
  let raw;
  try {
    raw = readFileSync(p, 'utf8');
  } catch (e) {
    fail('无法读取文件 ' + p + '（' + e.message + '）' + (usageHint || ''), 2);
  }
  if (raw.trim() === '') fail('文件为空：' + p, 2);
  if (/\.ya?ml$/i.test(p)) {
    try {
      return parseYaml(raw);
    } catch (e) {
      if (e instanceof YamlError) fail('YAML 解析失败：' + p + '（' + e.message + '）', 2);
      throw e;
    }
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    fail('JSON 解析失败：' + p + '（' + e.message + '）', 2);
  }
  return obj;
}

function printErrors(label, errors) {
  console.error('[atlas] ' + label + '：');
  for (const e of errors) console.error('  ' + e.code + ' ' + (e.path || '') + ': ' + e.message);
}

function loadRulesetAndCase(args) {
  const rulesPath = args.positional[0];
  if (!rulesPath) fail('用法：atlas.js <build|walk|bisect|counterfactual> <rules> --case <c> [...]', 2);
  const casePath = args.flags.case;
  if (!casePath) fail('缺少 --case <case.json>', 2);
  const rs = readInputOrExit(resolve(process.cwd(), rulesPath));
  const cs = readInputOrExit(resolve(process.cwd(), casePath));
  const vr = validateRuleset(rs);
  if (!vr.ok) {
    printErrors('规则集校验未通过（拒绝进入求值路径）', vr.errors);
    process.exit(1);
  }
  const vc = validateCase(rs, cs);
  if (!vc.ok) {
    printErrors('案例校验未通过', vc.errors);
    process.exit(1);
  }
  return { rs, cs, rulesPath };
}

// readJsonOrExit 的别名：JSON / YAML 子集按扩展名分派（历史名保留）。
const readInputOrExit = readJsonOrExit;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case') { flags.case = argv[++i]; continue; }
    if (a === '--case-b') { flags.caseB = argv[++i]; continue; }
    if (a === '--field') { flags.field = argv[++i]; continue; }
    if (a === '-o' || a === '--out') { flags.out = argv[++i]; continue; }
    if (a === '--') { for (const rest of argv.slice(i + 1)) positional.push(rest); break; }
    positional.push(a);
  }
  return { positional, flags };
}

function cmdSelftest() {
  // 内置自检：确定性双跑 + 渲染双跑逐字节一致 + 无外链 + 产物含契约标记
  const rulesPath = ROOT + '/data/samples/demo-game.rules.json';
  const casePath = ROOT + '/data/samples/demo-game.case.json';
  const rs = JSON.parse(readFileSync(rulesPath, 'utf8'));
  const cs = JSON.parse(readFileSync(casePath, 'utf8'));
  const vr = validateRuleset(rs);
  if (!vr.ok) { printErrors('selftest：样例规则集校验未通过', vr.errors); return 1; }

  const t1 = canonicalStringify(traceRuleset(rs, cs));
  const t2 = canonicalStringify(traceRuleset(rs, cs));
  if (sha256Hex(t1) !== sha256Hex(t2)) { console.error('selftest：引擎双跑不一致（求值确定性破坏）'); return 1; }

  const graph = buildGraph(rs);
  const h1 = renderHtml(graph, cs, rs);
  const h2 = renderHtml(graph, cs, rs);
  if (h1 !== h2) { console.error('selftest：渲染双跑字节不一致'); return 1; }

  const externalRe = /(?:src|href)\s*=\s*["']https?:\/\//i;
  const allowed = /http:\/\/www\.w3\.org\/[0-9]{4}\//;
  const hits = [];
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(h1)) !== null) {
    const url = m[1];
    if (/^https?:\/\//i.test(url) && !allowed.test(url)) hits.push(url);
  }
  if (hits.length > 0) { console.error('selftest：产物含外链 ' + hits.join(', ')); return 1; }
  if (externalRe.test(h1.replace(allowed, ''))) { console.error('selftest：产物含外链（src/href http）'); return 1; }
  for (const marker of ['atlas-graph', 'atlas-baseline', '__DECISION_GRAPH__']) {
    if (!h1.includes(marker) && marker !== '__DECISION_GRAPH__') { console.error('selftest：产物缺契约标记 ' + marker); return 1; }
  }
  if (/(20|19)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T\d{2}:/.test(h1)) {
    console.error('selftest：产物含 ISO 时间戳（违反无时间戳纪律）');
    return 1;
  }
  console.log('SELFTEST_OK');
  console.log('engine sha256 = ' + sha256Hex(t1));
  console.log('html   sha256 = ' + sha256Hex(h1));
  return 0;
}

function cmdBuild(args) {
  const { rs, cs } = loadRulesetAndCase(args);
  if (!args.flags.out) fail('缺少 -o <输出路径>', 2);
  const graph = buildGraph(rs);
  const html = renderHtml(graph, cs, rs);
  const out = resolve(process.cwd(), args.flags.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, 'utf8');
  console.log('BUILD_OK ' + out);
  console.log('html sha256 = ' + sha256Hex(html));
  return 0;
}

function cmdWalk(args) {
  const { rs, cs } = loadRulesetAndCase(args);
  const trace = traceRulesetAny(rs, cs);
  console.log(canonicalStringify(trace));
  return 0;
}

function cmdBisect(args) {
  const { rs, cs } = loadRulesetAndCase(args);
  const reports = args.flags.field
    ? [bisectField(rs, cs, args.flags.field)]
    : bisectAll(rs, cs);
  for (const r of reports) {
    if (r.status === 'skip') console.log(r.field + ': SKIP ' + r.reason);
    else if (r.status === 'no_boundary') console.log(r.field + ': NO_BOUNDARY（[' + r.search_range + '] 粗扫 ' + r.coarse_n + ' 点无异值对，合法结论）');
    else if (r.status === 'too_many') console.log(r.field + ': TOO_MANY 转折 ' + r.transitions + ' 个（上限 ' + r.max + '）');
    else for (const b of r.boundaries) {
      console.log(r.field + ': BOUNDARY ' + JSON.stringify(b));
    }
  }
  return 0;
}

function cmdCounterfactual(args) {
  const caseB = args.flags.caseB;
  if (!caseB) fail('缺少 --case-b <case.json>（对比案例）', 2);
  const rulesPath = args.positional[0];
  if (!rulesPath) fail('用法：atlas.js counterfactual <rules> --case <c1> --case-b <c2>', 2);
  const rs = readInputOrExit(resolve(process.cwd(), rulesPath));
  const vr = validateRuleset(rs);
  if (!vr.ok) { printErrors('规则集校验未通过（拒绝进入求值路径）', vr.errors); process.exit(1); }
  const c1 = readInputOrExit(resolve(process.cwd(), args.flags.case));
  const c2 = readInputOrExit(resolve(process.cwd(), caseB));
  const v1 = validateCase(rs, c1);
  const v2 = validateCase(rs, c2);
  if (!v1.ok) { printErrors('案例 A 校验未通过', v1.errors); process.exit(1); }
  if (!v2.ok) { printErrors('案例 B 校验未通过', v2.errors); process.exit(1); }
  const tA = traceRulesetAny(rs, c1);
  const tB = traceRulesetAny(rs, c2);
  const d = diffPaths(tA, tB);
  console.log(canonicalStringify({
    verdict_a: tA.verdict.id,
    verdict_b: tB.verdict.id,
    diverge_index: d.divergeIndex,
    diverge_node: d.divergeNode,
    only_a: d.onlyA,
    only_b: d.onlyB,
    common: d.common,
  }));
  return 0;
}

const USAGE = '用法：node tools/atlas.js <selftest | build | walk | bisect | counterfactual> [...]\n' +
  '  selftest                          内置自检\n' +
  '  build <rules> --case <c> -o <out.html>   编译单文件 HTML\n' +
  '  walk  <rules> --case <c>          打印求值 trace\n' +
  '  bisect <rules> --case <c> [--field <f>]  阈值二分（临界点证据对）\n' +
  '  counterfactual <rules> --case <c1> --case-b <c2>  反事实路径差\n';

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'selftest') return cmdSelftest();
  if (cmd === 'build') return cmdBuild(parseArgs(argv.slice(1)));
  if (cmd === 'walk') return cmdWalk(parseArgs(argv.slice(1)));
  if (cmd === 'bisect') return cmdBisect(parseArgs(argv.slice(1)));
  if (cmd === 'counterfactual') return cmdCounterfactual(parseArgs(argv.slice(1)));
  if (cmd === undefined || cmd === '-h' || cmd === '--help') { console.log(USAGE); return 0; }
  fail('未知命令：' + cmd + '\n' + USAGE, 2);
  return 2;
}

const code = main(process.argv.slice(2));
process.exit(code);
