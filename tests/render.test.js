// render.test.js —— 渲染确定性（G2/G6）与产物契约测试。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/render.js';
import { layoutGraph } from '../src/layout.js';
import { buildGraph } from '../src/graph.js';
import { sha256Hex } from '../src/canonical.js';
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

test('渲染确定性：同输入双渲染逐字节一致（G6）', () => {
  const rs = sampleRuleset();
  const graph = buildGraph(rs);
  const h1 = renderHtml(graph, sampleCase(), rs);
  const h2 = renderHtml(graph, sampleCase(), rs);
  assert.equal(sha256Hex(h1), sha256Hex(h2));
});

test('布局确定性：双跑坐标完全相等（G2）', () => {
  const graph = buildGraph(sampleRuleset());
  const l1 = layoutGraph(graph);
  const l2 = layoutGraph(graph);
  assert.deepEqual(l1.positions, l2.positions);
  assert.equal(l1.width, l2.width);
  assert.equal(l1.height, l2.height);
});

test('布局结构不变量：父节点 x = 子节点中点；叶子 x 严格递增（G2）', () => {
  const graph = buildGraph(sampleRuleset());
  const layout = layoutGraph(graph);
  const pos = layout.positions;
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const n of graph.nodes) {
    const ys = pos[n.yes.to];
    const ns = pos[n.no.to];
    const expected = (ys.x + ns.x) / 2;
    assert.equal(pos[n.id].x, expected, '节点 ' + n.id + ' 应居中于子节点');
  }
  // 叶子（裁定）x 严格递增（按图中出现顺序）
  const leafXs = graph.verdicts.map((v) => pos[v.id].x);
  for (let i = 1; i < leafXs.length; i++) assert.ok(leafXs[i] > leafXs[i - 1], '叶子 x 应严格递增');
});

test('产物契约：内嵌 JSON 可解析、非模块脚本、含 SVG 与基础样式（G5 前提）', () => {
  const graph = buildGraph(sampleRuleset());
  const html = renderHtml(graph, sampleCase(), sampleRuleset());
  assert.ok(html.includes('<script type="application/json" id="atlas-graph">'), '必须含 atlas-graph 标记');
  assert.ok(html.includes('<script type="application/json" id="atlas-baseline">'), '必须含 atlas-baseline 标记');
  assert.ok(html.includes('function traceRuleset') || html.includes('traceRuleset'), '运行时必须含引擎 bundle');
  assert.ok(!html.includes('<script src='), '不得有外部脚本');
  assert.ok(!html.includes('<link rel='), '不得有外部样式');
  assert.ok(html.includes('<svg'), '必须含内联 SVG');
  // 内嵌 JSON 可解析且回读一致
  const m = html.match(/<script type="application\/json" id="atlas-graph">([\s\S]*?)<\/script>/);
  assert.ok(m, 'atlas-graph 内容可抽取');
  const parsed = JSON.parse(m[1]);
  assert.equal(parsed.ruleset_id, graph.ruleset_id);
  assert.equal(parsed.nodes.length, graph.nodes.length);
});

test('无外链：src/href 的 http URL 仅允许 w3.org 命名空间（G5）', () => {
  const graph = buildGraph(sampleRuleset());
  const html = renderHtml(graph, sampleCase(), sampleRuleset());
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  const violations = [];
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (/^https?:\/\//i.test(url) && !url.startsWith('http://www.w3.org/')) violations.push(url);
  }
  assert.deepEqual(violations, []);
});

test('无时间戳：产物不含 ISO 时间戳模式（G4）', () => {
  const graph = buildGraph(sampleRuleset());
  const html = renderHtml(graph, sampleCase(), sampleRuleset());
  assert.ok(!/(20|19)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T\d{2}:/.test(html));
});
