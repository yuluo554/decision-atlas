// m3.test.js —— M3 渲染完成守门：
//   A. 布局 tidy 精化：双跑全等 + edgeTarget/leafSequence 契约 + 结构不变量 + 无重叠（benchmark 12 包 + 样例）；
//   B. 渲染三件套产物契约：内嵌四份 JSON（graph/ruleset/baseline/bisect）、运行时含 counterfactual bundle、
//      Δ 高亮/阈值面板标记齐备；字节级双渲染一致、无外链、无时间戳（render.test 既有断言继续保持）；
//   C. 交互层零判定逻辑：页面运行时代码只做"取值 → 调引擎 → 映射展示"（静态扫描：不得出现阈值/算子/裁定字面量）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { layoutGraph } from '../src/layout.js';
import { buildGraph } from '../src/graph.js';
import { renderHtml } from '../src/render.js';
import { sha256Hex } from '../src/canonical.js';
import { traceRuleset, traceRulesetAny } from '../src/engine.js';
import { diffPaths, assertHighlightSet } from '../src/counterfactual.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = join(ROOT, 'data', 'benchmark');

function listFiles(dirRel) {
  return readdirSync(join(BENCH, dirRel)).filter((f) => f.endsWith('.json')).sort();
}
function loadPack(rulesFile) {
  const rs = JSON.parse(readFileSync(join(BENCH, 'rulesets', rulesFile), 'utf8'));
  const cf = JSON.parse(readFileSync(join(BENCH, 'cases', rulesFile.replace('.rules.json', '.cases.json').replace('bench-', '')), 'utf8'));
  return { rs, cf };
}
function sampleRuleset() {
  return JSON.parse(readFileSync(join(ROOT, 'data/samples/demo-game.rules.json'), 'utf8'));
}
function sampleCase() {
  return JSON.parse(readFileSync(join(ROOT, 'data/samples/demo-game.case.json'), 'utf8'));
}

// ---------- A. 布局 tidy ----------
test('A1 布局契约（13 包）：双跑全等、edgeTarget 可解析、叶序递增、父=子中点、同深度无重叠', () => {
  const files = ['data/samples/demo-game.rules.json', ...listFiles('rulesets').map((f) => 'data/benchmark/rulesets/' + f)];
  let n = 0;
  for (const rel of files) {
    const rs = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
    const graph = buildGraph(rs);
    const l1 = layoutGraph(graph);
    const l2 = layoutGraph(graph);
    assert.equal(sha256Hex(JSON.stringify(l1)), sha256Hex(JSON.stringify(l2)), '双跑全等：' + rel);
    const pos = l1.positions;
    for (const nd of graph.nodes) {
      for (const br of ['yes', 'no']) {
        const key = l1.edgeTarget[nd.id + ':' + br];
        assert.ok(pos[key] !== undefined, rel + ' 边目标可解析：' + nd.id + ':' + br);
      }
      const yx = pos[l1.edgeTarget[nd.id + ':yes']].x;
      const nx = pos[l1.edgeTarget[nd.id + ':no']].x;
      assert.ok(Math.abs(pos[nd.id].x - (yx + nx) / 2) <= 1e-9, rel + ' 父=子中点：' + nd.id);
    }
    let prev = -Infinity;
    for (const key of l1.leafSequence) {
      assert.ok(pos[key].x > prev, rel + ' 叶序严格递增');
      prev = pos[key].x;
    }
    const byDepth = {};
    for (const key of Object.keys(pos)) {
      const d = pos[key].depth;
      (byDepth[d] = byDepth[d] || []).push(pos[key].x);
    }
    for (const d of Object.keys(byDepth)) {
      const xs = byDepth[d].sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        assert.ok(xs[i] - xs[i - 1] >= 52 - 1e-9, rel + ' 同深度无重叠（depth ' + d + '）');
      }
    }
    n++;
  }
  assert.equal(n, 13);
});

test('A2 tidy 精化实质：共享裁定按引用实例化（id#k），长回边观感缓解', () => {
  // demo-game：V.reject 被 n1.no / n3.no / n4.no 三处引用 → 布局树应产出 3 个叶实例
  const graph = buildGraph(sampleRuleset());
  const layout = layoutGraph(graph);
  const rejectInstances = Object.keys(layout.positions).filter((k) => k === 'V.reject' || k.startsWith('V.reject#'));
  assert.equal(rejectInstances.length, 3, 'V.reject 应实例化为 3 叶（首实例保留原 id）');
  assert.ok(layout.positions['V.reject'], '首实例键 = 原 id');
  // 叶序 = 实例总数：4 条件节点 + 5 叶实例
  assert.equal(layout.leafSequence.length, 5);
  assert.deepEqual(Object.keys(layout.positions).length, graph.nodes.length + 5);
});

// ---------- B. 渲染三件套产物契约 ----------
test('B1 产物契约：四份内嵌 JSON 可解析回读；运行时含 Δ/阈值面板标记；bundle 含 counterfactual', () => {
  const rs = sampleRuleset();
  const cs = sampleCase();
  const graph = buildGraph(rs);
  const html = renderHtml(graph, cs, rs);
  const extract = (id) => {
    const m = html.match(new RegExp('<script type="application/json" id="' + id + '">([\\s\\S]*?)</script>'));
    assert.ok(m, '缺内嵌 JSON：' + id);
    return JSON.parse(m[1]);
  };
  assert.equal(extract('atlas-graph').ruleset_id, graph.ruleset_id);
  assert.equal(extract('atlas-ruleset').ruleset_id, rs.ruleset_id);
  assert.deepEqual(extract('atlas-baseline'), cs);
  const bisect = extract('atlas-bisect');
  assert.ok(Array.isArray(bisect) && bisect.length === rs.inputs.length, 'atlas-bisect = 每输入字段一条报告');
  // bisect 证据自足：ok 报告的证据对可由同一引擎独立复核（g(v*)≠g(v+ε)，宽度≤ε）
  const base = cs;
  const g = (field, v) => traceRulesetAny(rs, { ...base, [field]: v }).verdict.id;
  let pairs = 0;
  for (const r of bisect) {
    if (r.status !== 'ok') continue;
    for (const b of r.boundaries) {
      assert.notEqual(g(b.field, b.v_star), g(b.field, b.v_plus_eps), r.field + ' 证据对自足');
      assert.ok(b.v_plus_eps - b.v_star <= r.eps, r.field + ' 宽度 ≤ eps');
      pairs++;
    }
  }
  assert.ok(pairs >= 1, 'demo-game 应有 ≥1 条阈值证据对');
  // 运行时标记三件套
  assert.ok(html.includes('assertHighlightSet'), '运行时含 Δ 高亮断言（bundle 内 counterfactual.js）');
  assert.ok(html.includes('diffPaths'), '运行时含 diffPaths');
  assert.ok(html.includes('atlas-bisect'), '运行时消费阈值面板数据');
  assert.ok(html.includes('threshold-panel'), '含阈值面板容器');
  assert.ok(html.includes('page-error'), '含页面错误条（断言违反可见化）');
});

test('B2 阈值面板数据为构建期预计算：运行时代码不得出现二分/粗扫逻辑', () => {
  const rs = sampleRuleset();
  const graph = buildGraph(rs);
  const html = renderHtml(graph, sampleCase(), rs);
  // 取最后一个 <script>（运行时脚本）——bundle 部分（engine/counterfactual）之后为交互层
  const scripts = html.split('<script>');
  assert.ok(scripts.length >= 2);
  const runtime = scripts[scripts.length - 1];
  // bundle 含 bisect 语义（counterscan 等）不受限；交互层不得内嵌二分计算
  assert.ok(!runtime.includes('coarseN'), '交互层不得出现粗扫参数');
  assert.ok(!runtime.includes('v_star ===') && !/while\s*\(.*b\s*-\s*a/.test(runtime), '交互层不得内嵌二分循环');
  // 交互层零判定逻辑：不得出现规则字面量（阈值数字/算子符号表/裁定 id）
  assert.ok(!/level\s*[<>=]|wins\s*[<>=]/.test(runtime), '交互层不得内嵌字段比较表达式');
  assert.ok(!runtime.includes('V.direct') && !runtime.includes('V.playoff'), '交互层不得内嵌样例裁定 id');
});

test('B3 确定性与无外链回归：双渲染 sha256 相等（render.test 同口径复验，改 layout/render 后保持）', () => {
  const rs = sampleRuleset();
  const cs = sampleCase();
  const graph = buildGraph(rs);
  const h1 = renderHtml(graph, cs, rs);
  const h2 = renderHtml(graph, cs, rs);
  assert.equal(sha256Hex(h1), sha256Hex(h2));
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  const violations = [];
  while ((m = re.exec(h1)) !== null) {
    if (/^https?:\/\//i.test(m[1]) && !m[1].startsWith('http://www.w3.org/')) violations.push(m[1]);
  }
  assert.deepEqual(violations, []);
});

// ---------- C. 端到端：Δ 高亮集合契约（渲染层数据源复验） ----------
test('C1 渲染层 Δ 数据源：diffPaths + assertHighlightSet 在样例反事实对上成立', () => {
  const rs = sampleRuleset();
  const base = sampleCase();
  const alt = { ...base, level: 5 };
  const tA = traceRuleset(rs, base);
  const tB = traceRuleset(rs, alt);
  const d = diffPaths(tA, tB);
  assert.equal(d.divergeNode, 'n1');
  // 渲染层将 exactly [..d.onlyA, ..d.onlyB] 传入断言（与 src/render.js renderCounterfactual 同构）
  assert.doesNotThrow(() => assertHighlightSet(tA, tB, [...d.onlyA, ...d.onlyB]));
  assert.throws(() => assertHighlightSet(tA, tB, [...d.onlyA]), /缺失/);
});
