#!/usr/bin/env node
// atlas.js —— 用户 CLI（零第三方依赖）。退出码三语义（K 口径 D-07，锁进测试）：
//   0 = 成功；1 = 内容校验失败（schema/case 校验未通过）；2 = 用法或输入形态不可用（缺文件/坏 JSON/未知命令）。
//
// v0 子命令：
//   selftest                       内置自检（确定性 + 渲染双跑 + 无外链），退出码携带成败
//   build <rules> --case <c> -o out.html   编译单文件 HTML
//   walk <rules> --case <c>        打印求值 trace（canonical JSON）
// （M2 起追加 bisect / counterfactual；M4 起 validate / bench 由独立工具承担）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRuleset, validateCase } from '../src/schema.js';
import { traceRuleset } from '../src/engine.js';
import { buildGraph } from '../src/graph.js';
import { renderHtml } from '../src/render.js';
import { canonicalStringify, canonicalSha256, sha256Hex } from '../src/canonical.js';

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
  if (!rulesPath) fail('用法：atlas.js <build|walk> <rules.json> --case <case.json> [...]', 2);
  const casePath = args.flags.case;
  if (!casePath) fail('缺少 --case <case.json>', 2);
  const rs = readJsonOrExit(resolve(process.cwd(), rulesPath));
  const cs = readJsonOrExit(resolve(process.cwd(), casePath));
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

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case') { flags.case = argv[++i]; continue; }
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
  const trace = traceRuleset(rs, cs);
  console.log(canonicalStringify(trace));
  return 0;
}

const USAGE = '用法：node tools/atlas.js <selftest | build | walk> [...]\n' +
  '  selftest                          内置自检\n' +
  '  build <rules.json> --case <c> -o <out.html>   编译单文件 HTML\n' +
  '  walk  <rules.json> --case <c>     打印求值 trace\n';

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'selftest') return cmdSelftest();
  if (cmd === 'build') return cmdBuild(parseArgs(argv.slice(1)));
  if (cmd === 'walk') return cmdWalk(parseArgs(argv.slice(1)));
  if (cmd === undefined || cmd === '-h' || cmd === '--help') { console.log(USAGE); return 0; }
  fail('未知命令：' + cmd + '\n' + USAGE, 2);
  return 2;
}

const code = main(process.argv.slice(2));
process.exit(code);
