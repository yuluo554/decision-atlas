// engine.js —— 确定性规则引擎（求值 / 路径 / 裁定）。v0 覆盖 tree 模式；list 模式与反事实/阈值 M2 接入。
//
// 契约（04 §2，K 口径）：
//   - 纯函数：不读文件、不取时钟、不随机；同输入重复运行结果完全一致；
//   - 零规则字面量：本模块（及一切求值/渲染代码）不得出现规则集阈值/裁定串——
//     数值只存在于规则集；门禁测试扫描本文件（M2 建立扫描面）；
//   - trace 结构：{ ruleset_id, nodePath, edges, steps, verdict }；
//     edges 元素形如 {from, branch, to}，branch ∈ "yes" | "no"（branch 参与边的身份）；
//     edges = 全部走通的边，**含进入裁定的终端边**（v1 冻结勘误 F-5：v0 曾漏记终端边），
//     与产物 SVG 的 line.edge 元素一一对应。
//   - list 模式（M2）：按序逐条求值、首命中生效；无命中 → default_verdict；
//     nodePath = 已求值规则序列（含命中条），未求值规则不出现。
//     trace 形状与 tree 完全一致：miss → {from: 规则i, branch:"no", to: 规则i+1}，
//     命中 → 终端边 {from: 命中规则, branch:"yes", to: 裁定id}；
//     末条 miss → {from: 末条规则, branch:"no", to: default_verdict}——
//     与 graph.js 的 list→tree 编译链逐边一致（编译等价性的 trace 级判据）。

export function evaluateCondition(cond, values) {
  if (cond.all !== undefined) {
    for (const c of cond.all) if (!evaluateCondition(c, values)) return false;
    return true;
  }
  if (cond.any !== undefined) {
    for (const c of cond.any) if (evaluateCondition(c, values)) return true;
    return false;
  }
  const { field, op, value } = cond;
  const v = values[field];
  switch (op) {
    case '>=': return v >= value;
    case '>': return v > value;
    case '<=': return v <= value;
    case '<': return v < value;
    case '==': return v === value;
    case '!=': return v !== value;
    case 'in': return value.includes(v);
    case 'not_in': return !value.includes(v);
    default: throw new Error('engine：未知算子 ' + String(op));
  }
}

export function traceRuleset(rs, values) {
  const nodeById = new Map(rs.nodes.map((n) => [n.id, n]));
  const verdictById = new Map(rs.verdicts.map((v) => [v.id, v]));
  const trace = { ruleset_id: rs.ruleset_id, nodePath: [], edges: [], steps: [], verdict: null };
  let cur = rs.root;
  const MAX_STEPS = rs.nodes.length + 1; // 树结构保证终止；防御性上限
  for (let step = 0; step < MAX_STEPS; step++) {
    if (verdictById.has(cur)) {
      const vd = verdictById.get(cur);
      trace.verdict = { id: vd.id, label: vd.label, kind: vd.kind };
      // 终止：最后一条 steps 的目标即命中裁定 → 补记进入裁定的终端边（勘误 F-5）
      const last = trace.steps[trace.steps.length - 1];
      trace.edges.push({ from: last.node, branch: last.branch, to: last.next });
      return trace;
    }
    const node = nodeById.get(cur);
    if (node === undefined) throw new Error('engine：引用不存在：' + String(cur));
    const passed = evaluateCondition(node.condition, values);
    let branch = passed ? 'yes' : 'no';
    let next = node.branches[branch];
    if (next === '$default') next = rs.default_verdict;
    trace.nodePath.push(node.id);
    trace.steps.push({ node: node.id, result: passed, branch, next });
    if (trace.steps.length > 1) {
      const prev = trace.steps[trace.steps.length - 2];
      trace.edges.push({ from: prev.node, branch: prev.branch, to: node.id });
    }
    cur = next;
  }
  throw new Error('engine：步数超出节点数（结构错误：环未被校验拦截？）');
}

export function traceListRuleset(rs, values) {
  // list 模式求值：按序逐条、首命中生效；无命中 → default_verdict（04 §2）。
  const verdictById = new Map(rs.verdicts.map((v) => [v.id, v]));
  const trace = { ruleset_id: rs.ruleset_id, nodePath: [], edges: [], steps: [], verdict: null };
  const rules = rs.rules;
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const passed = evaluateCondition(rule.when, values);
    const next = passed ? verdictById.has(rule.then) ? rule.then : null : i + 1 < rules.length ? rules[i + 1].id : rs.default_verdict;
    trace.nodePath.push(rule.id);
    trace.steps.push({ node: rule.id, result: passed, branch: passed ? 'yes' : 'no', next });
    if (i > 0) {
      const prev = trace.steps[i - 1];
      trace.edges.push({ from: prev.node, branch: prev.branch, to: rule.id });
    }
    if (passed) {
      const vd = verdictById.get(rule.then);
      trace.verdict = { id: vd.id, label: vd.label, kind: vd.kind };
      trace.edges.push({ from: rule.id, branch: 'yes', to: rule.then }); // 终端边（F-5 同口径）
      return trace;
    }
  }
  const vd = verdictById.get(rs.default_verdict);
  trace.verdict = { id: vd.id, label: vd.label, kind: vd.kind };
  // 全 miss 走默认裁定：末条规则的 no 边即终端边（F-5 同口径：edges 含全部走通的边）
  trace.edges.push({ from: rules[rules.length - 1].id, branch: 'no', to: rs.default_verdict });
  return trace;
}

export function traceRulesetAny(rs, values) {
  return rs.mode === 'list' ? traceListRuleset(rs, values) : traceRuleset(rs, values);
}
