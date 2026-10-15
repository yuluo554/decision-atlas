// graph.js —— 编译层：规则集 → 图结构（v0：tree 模式直通；list→tree 编译 M2）。
//
// 契约（04 §3）：
//   - Graph：{ ruleset_id, root, nodes: [{id, label, condition, yes: {to, kind}, no: {to, kind}}], verdicts: [...] }；
//   - kind ∈ {node, verdict}（分支目标的类型）；
//   - 不变量（build 时断言；M4 校验器对产物复验）：
//     1) 节点数 = 规则数（tree 模式：nodes.length；list 模式：rules.length）；
//     2) 每条边可归因到源节点条件的一个极性（yes/no 各至多一条）；
//     3) 无孤儿节点（全部从 root 可达）；
//     4) 每路径终止于叶子裁定。

import { validateRuleset } from './schema.js';

export function buildGraph(rs) {
  const check = validateRuleset(rs);
  if (!check.ok) {
    const detail = check.errors.map((e) => e.code + ' ' + e.path + ': ' + e.message).join('; ');
    throw new Error('buildGraph：规则集校验未通过（' + detail + '）');
  }
  const verdictById = new Map(rs.verdicts.map((v) => [v.id, v]));
  const nodes = rs.nodes.map((n) => {
    const resolve = (ref) => {
      if (ref === '$default') return { to: rs.default_verdict, kind: 'verdict' };
      if (verdictById.has(ref)) return { to: ref, kind: 'verdict' };
      return { to: ref, kind: 'node' };
    };
    return {
      id: n.id,
      label: n.label === undefined ? n.id : n.label,
      condition: n.condition,
      yes: resolve(n.branches.yes),
      no: resolve(n.branches.no),
    };
  });
  const verdicts = rs.verdicts.map((v) => ({ id: v.id, label: v.label, kind: v.kind }));
  const graph = {
    ruleset_id: rs.ruleset_id,
    root: rs.root,
    nodes,
    verdicts,
    inputs: rs.inputs.map((i) => ({ key: i.key, type: i.type, label: i.label, unit: i.unit === undefined ? null : i.unit, values: i.values === undefined ? null : i.values, search_range: i.search_range === undefined ? null : i.search_range })),
  };
  // default_verdict 仅在规则集声明时携带（K 口径：canonical 序列化禁 undefined）
  if (rs.default_verdict !== undefined) graph.default_verdict = rs.default_verdict;
  return graph;
}
