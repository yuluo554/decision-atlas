// render.js —— 单文件 HTML 渲染（骨架 v0）。
//
// 契约（04 §9，K 口径）：
//   - 产物：单文件 HTML（内联 CSS/SVG/JS，零外链——白名单仅 w3.org 命名空间 URI，无网络请求）；
//   - 内嵌 <script type="application/json" id="atlas-graph">__DECISION_GRAPH__ JSON（全部 "<" 转义为 \u003c）；
//   - 运行时脚本 = src/bundle.js 拼接（非模块，file:// 可开）；运行时只做"取值 → 求值 → 高亮"，
//     零判定逻辑（引擎来自 bundle）；
//   - 预渲染 SVG：build 时消费 layout 坐标（运行时不重算坐标）；
//   - 无时间戳：同输入双渲染逐字节一致（tests/render.test.js 断言）。
// v0 交互：字段面板（number/boolean/enum/string）→ 引擎重算 → 路径/边高亮 + 裁定横幅；
// 反事实 Δ 高亮与阈值面板 M3 接入。

import { layoutGraph, LAYOUT } from './layout.js';
import { bundleModules } from './bundle.js';
import { canonicalSha256 } from './canonical.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildSvg(graph, layout) {
  const pos = layout.positions;
  const parts = [];
  parts.push('<svg id="atlas-svg" xmlns="' + SVG_NS + '" viewBox="0 0 ' + layout.width + ' ' + layout.height + '" role="img" aria-label="decision tree">');
  // 边（条件语义标签：yes/no）
  for (const n of graph.nodes) {
    for (const branch of ['yes', 'no']) {
      const to = n[branch].to;
      const a = pos[n.id];
      const b = pos[to];
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const cls = 'edge e-' + n.id + '-' + branch;
      parts.push('<line class="' + cls + '" data-from="' + esc(n.id) + '" data-branch="' + branch + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" />');
      parts.push('<text class="edge-label lbl-' + n.id + '-' + branch + '" x="' + mx + '" y="' + (my - 6) + '" text-anchor="middle">' + (branch === 'yes' ? '满足' : '不满足') + '</text>');
    }
  }
  // 节点（条件节点 + 裁定叶子）
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const verdictById = new Map(graph.verdicts.map((v) => [v.id, v]));
  for (const [id, p] of Object.entries(pos)) {
    if (nodeById.has(id)) {
      const n = nodeById.get(id);
      parts.push('<g class="node n-' + id + '" data-id="' + esc(id) + '">');
      parts.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="' + LAYOUT.NODE_R + '" />');
      parts.push('<text x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle">' + esc(n.label) + '</text>');
      parts.push('</g>');
      // 条件原文放在节点下方（确定性布局产物的一部分）
      parts.push('<text class="cond" x="' + p.x + '" y="' + (p.y + LAYOUT.NODE_R + 16) + '" text-anchor="middle">' + esc(condText(n.condition)) + '</text>');
    } else if (verdictById.has(id)) {
      const v = verdictById.get(id);
      parts.push('<g class="verdict v-' + id + '" data-id="' + esc(id) + '">');
      parts.push('<rect x="' + (p.x - 40) + '" y="' + (p.y - 18) + '" width="80" height="36" rx="8" />');
      parts.push('<text x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle">' + esc(v.label) + '</text>');
      parts.push('</g>');
    }
  }
  parts.push('</svg>');
  return parts.join('\n');
}

function condText(cond) {
  if (cond.all !== undefined) return '全部满足（' + cond.all.length + ' 条）';
  if (cond.any !== undefined) return '任一满足（' + cond.any.length + ' 条）';
  const opText = { '>=': '≥', '>': '＞', '<=': '≤', '<': '＜', '==': '=', '!=': '≠', in: '属于', not_in: '不属于' }[cond.op] || cond.op;
  return cond.field + ' ' + opText + ' ' + JSON.stringify(cond.value);
}

export function renderHtml(graph, baselineCase, ruleset) {
  // ruleset（原始规则集）供求值引擎；graph（编译图）供展示与校验。
  // K 口径（04 §9）：内嵌两份 JSON——atlas-graph=__DECISION_GRAPH__（编译图，校验器消费）、
  // atlas-ruleset=原始规则集（运行时引擎消费，结构含 branches）。
  if (ruleset === undefined) throw new Error('renderHtml：缺少 ruleset（运行时求值必需）');
  const layout = layoutGraph(graph);
  const graphJson = JSON.stringify(graph).replace(/</g, '\\u003c');
  const rulesetJson = JSON.stringify(ruleset).replace(/</g, '\\u003c');
  const runtime = bundleModules(['engine.js']);
  const svg = buildSvg(graph, layout);
  const graphSha = canonicalSha256(graph).slice(0, 12);
  const fields = graph.inputs.map((inp) => {
    const base = baselineCase[inp.key];
    let control;
    if (inp.type === 'number') {
      control = '<input id="f-' + esc(inp.key) + '" type="number" step="any" value="' + esc(String(base)) + '" />';
    } else if (inp.type === 'boolean') {
      const opts = [true, false].map((b) => '<option value="' + b + '"' + (b === base ? ' selected' : '') + '>' + String(b) + '</option>').join('');
      control = '<select id="f-' + esc(inp.key) + '">' + opts + '</select>';
    } else if (inp.type === 'enum') {
      const opts = inp.values.map((v) => '<option value="' + esc(v) + '"' + (v === base ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
      control = '<select id="f-' + esc(inp.key) + '">' + opts + '</select>';
    } else {
      control = '<input id="f-' + esc(inp.key) + '" type="text" value="' + esc(base) + '" />';
    }
    return '<div class="field"><label for="f-' + esc(inp.key) + '">' + esc(inp.label) + ' <code>' + esc(inp.key) + '</code> <small>' + esc(inp.type) + '</small></label>' + control + '</div>';
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>决策宇宙 — ${esc(graph.ruleset_id)}</title>
<style>
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; color: #1c2430; background: #f5f7fa; }
header { padding: 16px 24px; background: #ffffff; border-bottom: 1px solid #dde3ea; }
header h1 { margin: 0 0 4px; font-size: 18px; }
header p { margin: 0; font-size: 12px; color: #5a6675; }
main { display: flex; gap: 16px; padding: 16px 24px; align-items: flex-start; flex-wrap: wrap; }
#panel { width: 280px; flex: none; background: #ffffff; border: 1px solid #dde3ea; border-radius: 10px; padding: 16px; }
#panel .field { margin-bottom: 12px; }
#panel label { display: block; font-size: 13px; margin-bottom: 4px; }
#panel code { font-size: 11px; color: #5a6675; }
#panel small { color: #8a94a3; font-size: 10px; }
#panel input, #panel select { width: 100%; padding: 6px 8px; border: 1px solid #c9d2dd; border-radius: 6px; font-size: 14px; }
#panel button { width: 100%; padding: 8px 0; margin-top: 4px; border: 0; border-radius: 8px; background: #2456d6; color: #ffffff; font-size: 14px; cursor: pointer; }
#panel button.secondary { background: #e8ecf2; color: #1c2430; margin-top: 8px; }
#stage { flex: 1; min-width: 480px; background: #ffffff; border: 1px solid #dde3ea; border-radius: 10px; padding: 8px; overflow: auto; }
#banner { margin: 0 24px 12px; padding: 10px 16px; border-radius: 8px; background: #eef2ff; border: 1px solid #c9d6ff; font-size: 14px; }
#banner b { font-size: 15px; }
svg { width: 100%; height: auto; max-height: 78vh; }
svg line { stroke: #b9c2ce; stroke-width: 2; }
svg line.on { stroke: #2456d6; stroke-width: 3.5; }
svg line.diverge { stroke: #d64545; stroke-width: 3.5; stroke-dasharray: 6 3; }
svg .edge-label { font-size: 10px; fill: #8a94a3; }
svg .edge-label.on { fill: #2456d6; font-weight: 600; }
svg .node circle { fill: #ffffff; stroke: #7a8698; stroke-width: 2; }
svg .node.on circle { fill: #e7edff; stroke: #2456d6; }
svg .node text, svg .verdict text { font-size: 12px; fill: #1c2430; }
svg .node .cond { font-size: 10px; fill: #5a6675; }
svg .verdict rect { fill: #f0f3f8; stroke: #7a8698; stroke-width: 2; }
svg .verdict.on rect { fill: #e7f7ec; stroke: #1d9a55; }
footer { padding: 12px 24px 24px; font-size: 11px; color: #8a94a3; }
</style>
</head>
<body>
<header>
  <h1>决策宇宙 · ${esc(graph.ruleset_id)}</h1>
  <p>规则集确定性求值 — 修改字段后重算路径；纯本地运行，无任何网络请求。</p>
</header>
<div id="banner">基准裁定：<b id="verdict-text">（待求值）</b></div>
<main>
  <section id="panel">
    ${fields}
    <button id="recompute" type="button">重新求值</button>
    <button id="reset" type="button" class="secondary">重置为基准案例</button>
  </section>
  <section id="stage">
${svg}
  </section>
</main>
<footer>decision-atlas v0.1.0（骨架） · 规则集 ${esc(graph.ruleset_id)} · 图摘要 <code>${graphSha}</code> · 零依赖 · 零外链 · 坐标由布局算法产出</footer>
<script type="application/json" id="atlas-graph">${graphJson}</script>
<script type="application/json" id="atlas-ruleset">${rulesetJson}</script>
<script type="application/json" id="atlas-baseline">${JSON.stringify(baselineCase).replace(/</g, '\\u003c')}</script>
<script>
${runtime}
var __GRAPH__ = JSON.parse(document.getElementById('atlas-graph').textContent);
var __RULESET__ = JSON.parse(document.getElementById('atlas-ruleset').textContent);
var __VALUES__ = {};
function readValues() {
  var out = {};
  var inputs = __GRAPH__.inputs;
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    var el = document.getElementById('f-' + inp.key);
    var v = el.value;
    if (inp.type === 'number') { v = Number(v); }
    else if (inp.type === 'boolean') { v = (v === 'true'); }
    out[inp.key] = v;
  }
  return out;
}
function evaluate(values) {
  return traceRuleset(__RULESET__, values);
}
function renderTrace(trace) {
  var onNodes = {}; var onEdges = {};
  for (var i = 0; i < trace.nodePath.length; i++) onNodes[trace.nodePath[i]] = true;
  for (var j = 0; j < trace.edges.length; j++) onEdges[trace.edges[j].from + ':' + trace.edges[j].branch] = true;
  var nodes = document.querySelectorAll('svg .node');
  for (var k = 0; k < nodes.length; k++) {
    var id = nodes[k].getAttribute('data-id');
    nodes[k].classList.toggle('on', onNodes[id] === true);
  }
  var verdicts = document.querySelectorAll('svg .verdict');
  for (var m = 0; m < verdicts.length; m++) {
    var vid = verdicts[m].getAttribute('data-id');
    verdicts[m].classList.toggle('on', trace.verdict.id === vid);
  }
  var edges = document.querySelectorAll('svg line.edge');
  for (var e = 0; e < edges.length; e++) {
    var from = edges[e].getAttribute('data-from');
    var br = edges[e].getAttribute('data-branch');
    edges[e].classList.toggle('on', onEdges[from + ':' + br] === true);
  }
  document.getElementById('verdict-text').textContent = trace.verdict.label + '（' + trace.verdict.id + ' · ' + trace.verdict.kind + '）';
}
document.getElementById('recompute').addEventListener('click', function () {
  renderTrace(evaluate(readValues()));
});
document.getElementById('reset').addEventListener('click', function () {
  __VALUES__ = JSON.parse(document.getElementById('atlas-baseline').textContent);
  var inputs = __GRAPH__.inputs;
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    document.getElementById('f-' + inp.key).value = String(__VALUES__[inp.key]);
  }
  renderTrace(evaluate(__VALUES__));
});
__VALUES__ = JSON.parse(document.getElementById('atlas-baseline').textContent);
renderTrace(evaluate(__VALUES__));
</script>
</body>
</html>
`;
}
