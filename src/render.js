// render.js —— 单文件 HTML 渲染（04 §9，M3 完成）。
//
// 契约（K 口径）：
//   - 产物：单文件 HTML（内联 CSS/SVG/JS，零外链——白名单仅 w3.org 命名空间 URI，无网络请求）；
//   - 内嵌 JSON（<script type="application/json">）：atlas-graph=__DECISION_GRAPH__（编译图，
//     全部 "<" 转义为 \u003c）、atlas-ruleset=原始规则集（运行时引擎消费）、
//     atlas-baseline=基准案例、atlas-bisect=阈值二分证据对（构建期预计算，运行时零算法）；
//   - 运行时脚本 = src/bundle.js 拼接（非模块，file:// 可开）：engine.js + counterfactual.js；
//     运行时只做"取值 → 求值/求差 → 映射展示"，零判定逻辑（阈值证据对不由运行时计算）；
//   - 预渲染 SVG：build 时消费 layout 坐标（运行时只切 class，不重画、不重算坐标）；
//   - 无时间戳：同输入双渲染逐字节一致（tests/render.test.js 断言）。
// 交互三件套（M3）：
//   ① 走通高亮：重算 trace → nodePath/edges 高亮 + 裁定横幅（v0 已有，改用 edgeTarget 取端点）；
//   ② 反事实 Δ 高亮：改字段 → 重算 A' → diffPaths vs 基准 A → onlyA∪onlyB 边染红；
//      高亮集合断言走 counterfactual.assertHighlightSet（集合等式双向包含，违反即页面报错）；
//   ③ 阈值面板：展示 atlas-bisect 内嵌证据对（v*/v*+ε 与两侧裁定），点击行高亮对应字段条件节点。

import { layoutGraph, LAYOUT } from './layout.js';
import { bundleModules } from './bundle.js';
import { canonicalSha256 } from './canonical.js';
import { bisectAll } from './bisect.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function jsonEsc(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function buildSvg(graph, layout) {
  const pos = layout.positions;
  const parts = [];
  parts.push('<svg id="atlas-svg" xmlns="' + SVG_NS + '" viewBox="0 0 ' + layout.width + ' ' + layout.height + '" role="img" aria-label="decision tree">');
  // 边（条件语义标签：yes/no）；端点取 edgeTarget 实例坐标（tidy 精化：裁定叶按引用实例化）
  for (const n of graph.nodes) {
    for (const branch of ['yes', 'no']) {
      const a = pos[n.id];
      const b = pos[layout.edgeTarget[n.id + ':' + branch]];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const cls = 'edge e-' + n.id + '-' + branch;
      parts.push('<line class="' + cls + '" data-from="' + esc(n.id) + '" data-branch="' + branch + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" />');
      parts.push('<text class="edge-label lbl-' + n.id + '-' + branch + '" x="' + mx + '" y="' + (my - 6) + '" text-anchor="middle">' + (branch === 'yes' ? '满足' : '不满足') + '</text>');
    }
  }
  // 节点（条件节点）+ 裁定叶实例（每实例各画一次；首实例 data-id=裁定id，复制实例 data-id=id#k）
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const verdictById = new Map(graph.verdicts.map((v) => [v.id, v]));
  const keys = Object.keys(pos).sort();
  for (const key of keys) {
    const p = pos[key];
    const baseId = key.includes('#') ? key.slice(0, key.indexOf('#')) : key;
    if (nodeById.has(key)) {
      const n = nodeById.get(key);
      parts.push('<g class="node n-' + key + '" data-id="' + esc(key) + '">');
      parts.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="' + LAYOUT.NODE_R + '" />');
      parts.push('<text x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle">' + esc(n.label) + '</text>');
      parts.push('</g>');
      parts.push('<text class="cond" x="' + p.x + '" y="' + (p.y + LAYOUT.NODE_R + 16) + '" text-anchor="middle">' + esc(condText(n.condition)) + '</text>');
    } else if (verdictById.has(baseId)) {
      const v = verdictById.get(baseId);
      parts.push('<g class="verdict v-' + key + '" data-id="' + esc(key) + '" data-verdict="' + esc(baseId) + '">');
      parts.push('<rect x="' + (p.x - 45) + '" y="' + (p.y - 18) + '" width="90" height="36" rx="8" />');
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

// 构建期阈值二分预计算：证据对进产物（运行时零算法）。
// 报告条目按字段聚合，只保留 status=ok 的证据对（skip/no_boundary/too_many 如实保留状态行）。
function buildBisectReport(ruleset, baselineCase) {
  const reports = bisectAll(ruleset, baselineCase);
  return reports.map((r) => {
    if (r.status !== 'ok') return { field: r.field, status: r.status, reason: r.reason, transitions: r.transitions, max: r.max };
    return { field: r.field, status: r.status, search_range: r.search_range, coarse_n: r.coarse_n, eps: r.eps, boundaries: r.boundaries };
  });
}

export function renderHtml(graph, baselineCase, ruleset) {
  if (ruleset === undefined) throw new Error('renderHtml：缺少 ruleset（运行时求值必需）');
  const layout = layoutGraph(graph);
  const graphJson = jsonEsc(graph);
  const rulesetJson = jsonEsc(ruleset);
  const baselineJson = jsonEsc(baselineCase);
  const bisectJson = jsonEsc(buildBisectReport(ruleset, baselineCase));
  const runtime = bundleModules(['engine.js', 'counterfactual.js']);
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
#panel h2 { font-size: 13px; margin: 18px 0 8px; border-top: 1px solid #dde3ea; padding-top: 14px; }
#threshold-panel { font-size: 12px; }
#threshold-panel .trow { padding: 6px 8px; border: 1px solid #e3e8ef; border-radius: 6px; margin-bottom: 6px; cursor: pointer; }
#threshold-panel .trow:hover { border-color: #2456d6; }
#threshold-panel .trow b { font-size: 12px; }
#threshold-panel .trow .ev { color: #5a6675; font-size: 11px; margin-top: 2px; }
#threshold-panel .tstat { color: #8a94a3; font-size: 11px; padding: 4px 8px; }
#stage { flex: 1; min-width: 480px; background: #ffffff; border: 1px solid #dde3ea; border-radius: 10px; padding: 8px; overflow: auto; }
#banner { margin: 0 24px 12px; padding: 10px 16px; border-radius: 8px; background: #eef2ff; border: 1px solid #c9d6ff; font-size: 14px; }
#banner b { font-size: 15px; }
#banner .delta-info { color: #8a3a3a; }
svg { width: 100%; height: auto; max-height: 78vh; }
svg line { stroke: #b9c2ce; stroke-width: 2; }
svg line.on { stroke: #2456d6; stroke-width: 3.5; }
svg line.diverge { stroke: #d64545; stroke-width: 3.5; stroke-dasharray: 6 3; }
svg .edge-label { font-size: 10px; fill: #8a94a3; }
svg .edge-label.on { fill: #2456d6; font-weight: 600; }
svg .edge-label.diverge { fill: #d64545; font-weight: 600; }
svg .node circle { fill: #ffffff; stroke: #7a8698; stroke-width: 2; }
svg .node.on circle { fill: #e7edff; stroke: #2456d6; }
svg .node.diverge circle { fill: #fdeaea; stroke: #d64545; }
svg .node text, svg .verdict text { font-size: 12px; fill: #1c2430; }
svg .node .cond { font-size: 10px; fill: #5a6675; }
svg .verdict rect { fill: #f0f3f8; stroke: #7a8698; stroke-width: 2; }
svg .verdict.on rect { fill: #e7f7ec; stroke: #1d9a55; }
#page-error { display: none; margin: 0 24px 12px; padding: 10px 16px; border-radius: 8px; background: #fdeaea; border: 1px solid #d64545; color: #8a1f1f; font-size: 13px; }
footer { padding: 12px 24px 24px; font-size: 11px; color: #8a94a3; }
</style>
</head>
<body>
<header>
  <h1>决策宇宙 · ${esc(graph.ruleset_id)}</h1>
  <p>规则集确定性求值 — 修改字段重算路径、反事实分叉高亮、阈值临界点证据。纯本地运行，无任何网络请求。</p>
</header>
<div id="page-error"></div>
<div id="banner">基准裁定：<b id="verdict-text">（待求值）</b><span id="delta-info" class="delta-info"></span></div>
<main>
  <section id="panel">
    ${fields}
    <button id="recompute" type="button">重新求值</button>
    <button id="reset" type="button" class="secondary">重置为基准案例</button>
    <h2>阈值临界点（构建期二分证据）</h2>
    <div id="threshold-panel">（加载中）</div>
  </section>
  <section id="stage">
${svg}
  </section>
</main>
<footer>decision-atlas v0.1.0 · 规则集 ${esc(graph.ruleset_id)} · 图摘要 <code>${graphSha}</code> · 零依赖 · 零外链 · 坐标由 tidy 布局算法产出 · 阈值证据为构建期预计算</footer>
<script type="application/json" id="atlas-graph">${graphJson}</script>
<script type="application/json" id="atlas-ruleset">${rulesetJson}</script>
<script type="application/json" id="atlas-baseline">${baselineJson}</script>
<script type="application/json" id="atlas-bisect">${bisectJson}</script>
<script>
${runtime}
var __GRAPH__ = JSON.parse(document.getElementById('atlas-graph').textContent);
var __RULESET__ = JSON.parse(document.getElementById('atlas-ruleset').textContent);
var __BASELINE__ = JSON.parse(document.getElementById('atlas-baseline').textContent);
var __BISECT__ = JSON.parse(document.getElementById('atlas-bisect').textContent);
function showPageError(err) {
  var el = document.getElementById('page-error');
  el.style.display = 'block';
  el.textContent = '页面运行时错误：' + (err && err.message ? err.message : String(err));
}
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
  // list 模式 → traceListRuleset（bundle 同时含两个引擎入口）
  return __RULESET__.mode === 'list' ? traceListRuleset(__RULESET__, values) : traceRuleset(__RULESET__, values);
}
function clearMarks() {
  var nodes = document.querySelectorAll('svg .node, svg .verdict');
  for (var i = 0; i < nodes.length; i++) { nodes[i].classList.remove('on'); nodes[i].classList.remove('diverge'); }
  var edges = document.querySelectorAll('svg line.edge');
  for (var j = 0; j < edges.length; j++) { edges[j].classList.remove('on'); edges[j].classList.remove('diverge'); }
  var labels = document.querySelectorAll('svg .edge-label');
  for (var k = 0; k < labels.length; k++) { labels[k].classList.remove('on'); labels[k].classList.remove('diverge'); }
}
function markPath(trace) {
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
    var vid = verdicts[m].getAttribute('data-verdict');
    verdicts[m].classList.toggle('on', trace.verdict.id === vid);
  }
  var edges = document.querySelectorAll('svg line.edge');
  for (var e = 0; e < edges.length; e++) {
    var from = edges[e].getAttribute('data-from');
    var br = edges[e].getAttribute('data-branch');
    var on = onEdges[from + ':' + br] === true;
    edges[e].classList.toggle('on', on);
    var label = document.querySelector('svg .lbl-' + from + '-' + br);
    if (label) label.classList.toggle('on', on);
  }
}
function renderTrace(trace) {
  clearMarks();
  markPath(trace);
  document.getElementById('verdict-text').textContent = trace.verdict.label + '（' + trace.verdict.id + ' · ' + trace.verdict.kind + '）';
}
// ② 反事实 Δ 高亮：高亮集合 = path(A) Δ path(A')，集合等式由 assertHighlightSet 断言
//   （双向包含，违反即抛错 → 页面错误条；交互层零判定逻辑：求值/求差全部来自 bundle 引擎）。
function renderCounterfactual(traceB) {
  var traceA = evaluate(__BASELINE__);
  var diff = diffPaths(traceA, traceB);
  var highlighted = [];
  for (var i = 0; i < diff.onlyA.length; i++) highlighted.push(diff.onlyA[i]);
  for (var j = 0; j < diff.onlyB.length; j++) highlighted.push(diff.onlyB[j]);
  assertHighlightSet(traceA, traceB, highlighted); // 断言契约（M3 渲染层直接消费）
  clearMarks();
  markPath(traceB);
  var divergeNodes = {};
  var edges = document.querySelectorAll('svg line.edge');
  for (var e = 0; e < edges.length; e++) {
    var identity = edges[e].getAttribute('data-from') + ':' + edges[e].getAttribute('data-branch');
    var isDelta = false;
    for (var a = 0; a < highlighted.length; a++) if (highlighted[a] === identity) { isDelta = true; break; }
    if (isDelta) edges[e].classList.add('diverge');
    if (isDelta) edges[e].classList.remove('on');
  }
  for (var d = 0; d < highlighted.length; d++) {
    var parts = highlighted[d].split(':');
    divergeNodes[parts[0]] = true;
  }
  var nodes = document.querySelectorAll('svg .node');
  for (var n = 0; n < nodes.length; n++) {
    if (divergeNodes[nodes[n].getAttribute('data-id')] === true) nodes[n].classList.add('diverge');
  }
  var info = document.getElementById('delta-info');
  if (diff.divergeIndex >= 0) {
    info.textContent = '　反事实：与基准在节点「' + diff.divergeNode + '」的第 ' + (diff.divergeIndex + 1) + ' 条边分叉，Δ 边 ' + highlighted.length + ' 条（红色虚线）；当前裁定：' + traceB.verdict.label;
  } else {
    info.textContent = '　反事实：与基准路径一致，无分叉。';
  }
  document.getElementById('verdict-text').textContent = traceB.verdict.label + '（' + traceB.verdict.id + ' · ' + traceB.verdict.kind + '）';
}
// ③ 阈值面板：渲染 atlas-bisect 内嵌证据对（构建期 bisectAll 预计算；运行时不做任何二分计算）。
function renderThresholdPanel() {
  var host = document.getElementById('threshold-panel');
  var html = '';
  for (var i = 0; i < __BISECT__.length; i++) {
    var r = __BISECT__[i];
    if (r.status !== 'ok') {
      html += '<div class="tstat">' + r.field + '：' + (r.reason ? r.reason : (r.status === 'no_boundary' ? '搜索域内无临界点' : '转折过多（' + r.transitions + ' > ' + r.max + '）')) + '</div>';
      continue;
    }
    for (var b = 0; b < r.boundaries.length; b++) {
      var bd = r.boundaries[b];
      html += '<div class="trow" data-field="' + r.field + '"><b>' + r.field + ' ≈ ' + bd.v_star + '</b>'
        + '<div class="ev">g(' + bd.v_star + ') = ' + bd.verdict_at + '　|　g(' + bd.v_plus_eps + ') = ' + bd.verdict_plus_eps
        + '　（宽度 ≤ ' + r.eps + '，可独立复核）</div></div>';
    }
  }
  if (html === '') html = '<div class="tstat">无数值字段证据对。</div>';
  host.innerHTML = html;
  var rows = host.querySelectorAll('.trow');
  for (var k = 0; k < rows.length; k++) {
    rows[k].addEventListener('click', function () {
      var field = this.getAttribute('data-field');
      var els = document.querySelectorAll('#panel .field label code');
      for (var t = 0; t < els.length; t++) {
        if (els[t].textContent === field) {
          els[t].scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
      }
    });
  }
}
try {
  document.getElementById('recompute').addEventListener('click', function () {
    var values = readValues();
    var baselineTrace = evaluate(__BASELINE__);
    var changed = false;
    var keys = Object.keys(__BASELINE__);
    for (var i = 0; i < keys.length; i++) {
      if (values[keys[i]] !== __BASELINE__[keys[i]]) { changed = true; break; }
    }
    // 值有变化 → 反事实对比模式；与基准完全一致 → 普通走通高亮。
    // （仅为展示分派，不含任何规则判定语义。）
    if (changed) renderCounterfactual(evaluate(values));
    else renderTrace(baselineTrace);
  });
  document.getElementById('reset').addEventListener('click', function () {
    var inputs = __GRAPH__.inputs;
    for (var i = 0; i < inputs.length; i++) {
      document.getElementById('f-' + inputs[i].key).value = String(__BASELINE__[inputs[i].key]);
    }
    document.getElementById('delta-info').textContent = '';
    renderTrace(evaluate(__BASELINE__));
  });
  renderTrace(evaluate(__BASELINE__));
  renderThresholdPanel();
} catch (err) {
  showPageError(err);
}
</script>
</body>
</html>
`;
}
