#!/usr/bin/env node
// validate.js —— 校验器（04 §8，M4）。退出码三语义（K-1，锁进测试）：
//   0 = 全过；1 = 内容校验失败（schema / 产物不变量 / --check 字节不一致）；2 = 用法或输入形态不可用。
//
// 用法：
//   node tools/validate.js <product.html>                    产物自检（四标记抽取 → schema 复验 + 不变量 1–4 + 坐标有限 + 无外链）
//   node tools/validate.js <rules> <product.html> --check    上述全部 + 按规则集重渲染与产物逐字节比对（sha256，防产物与规则集脱钩）
//   （--case <case.json> 可指定重渲染基准案例；缺省从产物 atlas-baseline 抽取）
//
// 产物不变量（04 §3，buildGraph 构建期断言的产物侧复验）：
//   1) 节点数 = 规则数（tree: nodes.length / list: rules.length）；
//   2) 每条边可归因到源节点条件的一个极性（每节点恰好 yes/no 两个分支且目标可解析）；
//   3) 无孤儿节点（全部从 root 可达）；
//   4) 每路径终止于叶子裁定（无环、无悬挂引用）。
// 另验：SVG 坐标全部有限 + 产物零外链（白名单仅 w3.org 命名空间）+ 无时间戳。
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRuleset, validateCase } from '../src/schema.js';
import { buildGraph } from '../src/graph.js';
import { renderHtml } from '../src/render.js';
import { sha256Hex } from '../src/canonical.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg, code) {
  console.error('[validate] ' + msg);
  process.exit(code);
}

const problems = [];
function problem(msg) { problems.push(msg); }

function readJsonFile(p) {
  let raw;
  try {
    if (!existsSync(p) || !statSync(p).isFile()) { fail('文件不存在或不是普通文件：' + p, 2); }
    raw = readFileSync(p, 'utf8');
  } catch (e) {
    fail('无法读取文件 ' + p + '（' + e.message + '）', 2);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail('JSON 解析失败：' + p + '（' + e.message + '）', 2);
  }
}

// 从产物 HTML 抽取内嵌 JSON（<script type="application/json" id="atlas-xxx">…</script>）。
export function extractEmbeddedJson(html, id) {
  const re = new RegExp('<script type="application/json" id="' + id + '">([\\s\\S]*?)</script>');
  const m = html.match(re);
  if (m === null) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return undefined; // 标记在但内容坏（区分于缺标记）
  }
}

// ---------- 产物不变量 ----------
export function checkGraphInvariants(graph, ruleset) {
  const errs = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const verdictIds = new Set(graph.verdicts.map((v) => v.id));

  // 1) 节点数 = 规则数（需要规则集对账；list 模式 = rules.length）
  if (ruleset !== undefined) {
    const ruleCount = ruleset.mode === 'list' ? (ruleset.rules || []).length : (ruleset.nodes || []).length;
    if (graph.nodes.length !== ruleCount) errs.push('不变量1 违反：图节点数 ' + graph.nodes.length + ' ≠ 规则数 ' + ruleCount);
  }

  // 2) 每条边可归因极性：每节点恰好 yes/no 两分支，目标可解析（node/verdict）
  for (const n of graph.nodes) {
    for (const branch of ['yes', 'no']) {
      const t = n[branch];
      if (t === undefined || typeof t.to !== 'string' || t.kind === undefined) {
        errs.push('不变量2 违反：节点 ' + n.id + ' 缺 ' + branch + ' 分支或目标形态非法');
        continue;
      }
      const resolvable = t.kind === 'verdict' ? verdictIds.has(t.to) : nodeIds.has(t.to);
      if (!resolvable) errs.push('不变量2 违反：节点 ' + n.id + ' 的 ' + branch + ' 边目标不可解析：' + t.to);
    }
  }

  // 3) 无孤儿：从 root 可达全部节点（verdict 叶除外）
  const reach = new Set();
  const stack = [graph.root];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (reach.has(cur) || !nodeIds.has(cur)) continue;
    reach.add(cur);
    const n = graph.nodes.find((x) => x.id === cur);
    if (n === undefined) continue;
    if (n.yes && n.yes.kind === 'node') stack.push(n.yes.to);
    if (n.no && n.no.kind === 'node') stack.push(n.no.to);
  }
  for (const id of nodeIds) {
    if (!reach.has(id)) errs.push('不变量3 违反：孤儿节点（从 root 不可达）：' + id);
  }

  // 4) 每路径终止于叶子：无环（条件节点 DAG）
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...nodeIds].map((id) => [id, WHITE]));
  const hasCycle = (u) => {
    color.set(u, GRAY);
    const n = graph.nodes.find((x) => x.id === u);
    if (n !== undefined) {
      for (const branch of ['yes', 'no']) {
        const t = n[branch];
        if (t === undefined || t.kind !== 'node') continue;
        if (color.get(t.to) === GRAY) return true;
        if (color.get(t.to) === WHITE && hasCycle(t.to)) return true;
      }
    }
    color.set(u, BLACK);
    return false;
  };
  if (nodeIds.has(graph.root) && hasCycle(graph.root)) errs.push('不变量4 违反：图中存在环（路径可能不终止）');
  return errs;
}

// SVG 坐标全部有限（M3 冻结契约：line/circle/rect/text 数值属性）。
export function checkSvgCoordsFinite(html) {
  const errs = [];
  const re = /<(?:line|circle|rect)\b[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const attrRe = /\b(x1|y1|x2|y2|cx|cy|r|x|y|width|height)\s*=\s*"([^"]*)"/g;
    let a;
    while ((a = attrRe.exec(tag)) !== null) {
      const v = Number(a[2]);
      if (!Number.isFinite(v)) errs.push('坐标非有限数：<' + tag.slice(1, 20) + '…> ' + a[1] + '="' + a[2] + '"');
    }
  }
  return errs;
}

// 无外链（G5：白名单仅 w3.org 命名空间 URI）+ 无时间戳。
export function checkNoExternalLinks(html) {
  const errs = [];
  const allowed = /http:\/\/www\.w3\.org\/[0-9]{4}\//;
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (/^https?:\/\//i.test(m[1]) && !allowed.test(m[1])) errs.push('外链：' + m[1]);
  }
  if (/(20|19)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T\d{2}:/.test(html)) errs.push('产物含 ISO 时间戳（违反无时间戳纪律）');
  return errs;
}

function runProductChecks(html, ruleset, label) {
  const graph = extractEmbeddedJson(html, 'atlas-graph');
  if (graph === null) { fail(label + '：产物缺 atlas-graph 契约标记（输入形态不可用）', 2); }
  if (graph === undefined) { problem(label + '：atlas-graph JSON 解析失败'); return null; }
  for (const marker of ['atlas-ruleset', 'atlas-baseline', 'atlas-bisect']) {
    const v = extractEmbeddedJson(html, marker);
    if (v === null) problem(label + '：产物缺 ' + marker + ' 契约标记');
    else if (v === undefined) problem(label + '：' + marker + ' JSON 解析失败');
  }

  const errs = checkGraphInvariants(graph, ruleset);
  for (const e of errs) problem(e);
  for (const e of checkSvgCoordsFinite(html)) problem(e);
  for (const e of checkNoExternalLinks(html)) problem(e);
  return graph;
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--case') flags.case = argv[i + 1];
    if (argv[i] === '--check') flags.check = true;
  }
  const htmlPath = args.find((a) => a.endsWith('.html') || a.endsWith('.htm'));
  const rulesPath = args.find((a) => a !== htmlPath);
  if (!htmlPath) fail('用法：node tools/validate.js <product.html> 或 <rules> <product.html> --check [--case <c>]（缺产物路径）', 2);
  const html = (() => {
    try {
      if (!existsSync(htmlPath) || !statSync(htmlPath).isFile()) fail('产物不存在或不是普通文件：' + htmlPath, 2);
      return readFileSync(htmlPath, 'utf8');
    } catch (e) {
      fail('无法读取产物 ' + htmlPath + '（' + e.message + '）', 2);
    }
  })();

  let ruleset = undefined;
  if (rulesPath) {
    ruleset = readJsonFile(resolve(rulesPath));
    const vr = validateRuleset(ruleset);
    if (!vr.ok) {
      console.error('[validate] 规则集校验未通过：');
      for (const e of vr.errors) console.error('  ' + e.code + ' ' + (e.path || '') + ': ' + e.message);
      process.exit(1);
    }
  } else {
    ruleset = extractEmbeddedJson(html, 'atlas-ruleset');
    if (ruleset === null) fail('产物缺 atlas-ruleset 标记且未提供规则集参数（输入形态不可用）', 2);
    if (ruleset === undefined) fail('产物 atlas-ruleset JSON 解析失败（内容校验失败）', 1);
  }

  // 产物侧：不变量 + 坐标 + 外链（graph 与内嵌 ruleset 对账）
  const embeddedRs = extractEmbeddedJson(html, 'atlas-ruleset');
  runProductChecks(html, embeddedRs !== null && embeddedRs !== undefined ? embeddedRs : ruleset, '产物');

  // --check：按（外部给定的）规则集重渲染，与产物逐字节比对
  if (flags.check) {
    if (!rulesPath) fail('--check 需要显式规则集参数（防止对产物内嵌规则集自证）', 2);
    const graph = buildGraph(ruleset);
    let caseObj = undefined;
    if (flags.case) {
      caseObj = readJsonFile(resolve(flags.case));
      const vc = validateCase(ruleset, caseObj);
      if (!vc.ok) {
        console.error('[validate] 案例校验未通过：');
        for (const e of vc.errors) console.error('  ' + e.code + ' ' + (e.path || '') + ': ' + e.message);
        process.exit(1);
      }
    } else {
      caseObj = extractEmbeddedJson(html, 'atlas-baseline');
      if (caseObj === null || caseObj === undefined) fail('--check 缺基准案例：给 --case 或确保产物含 atlas-baseline', 2);
    }
    const rerendered = renderHtml(graph, caseObj, ruleset);
    const shaA = sha256Hex(rerendered);
    const shaB = sha256Hex(html);
    if (shaA !== shaB) {
      problem('--check 字节比对失败：重渲染 sha256=' + shaA.slice(0, 16) + '… 产物 sha256=' + shaB.slice(0, 16) + '…（产物与规则集脱钩？）');
    }
  }

  if (problems.length > 0) {
    console.error('[validate] 校验未通过（' + problems.length + ' 项）：');
    for (const p of problems) console.error('  - ' + p);
    return 1;
  }
  console.log('VALIDATE_OK ' + htmlPath + (flags.check ? '（含 --check 字节比对）' : ''));
  return 0;
}

const isMain = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (isMain) {
  const code = main(process.argv.slice(2));
  process.exit(code);
}
