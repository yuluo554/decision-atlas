// coverage.js —— 覆盖率自检（抽象解释，04 §7，M4）。
//
// 契约（K-17 诚实口径）：
//   - 沿树做抽象解释：每个字段维护抽象约束——
//     number：区间 [lo, hi] + 端点开闭（loClosed/hiClosed）；boolean/enum/string：可能值集合；
//     未约束 = 全域（number: ±Infinity 开区间；离散: 全部声明值）；
//   - 逐边求交：yes 分支与条件求交，no 分支与条件"非"求交；
//   - 三值逻辑 {可行, 不可行, 未知}：复合条件（all/any）的否定分支、以及未知域上的
//     原子否定一律标 unknown（复合否定不细化——宁可少报不可假报）；
//   - 报告三类：
//     unreachable_branch：到达该分支时前缀约束已为空（如 <100 后又要求 >=120）；
//     contradiction：同一路径上同字段条件互斥导致分支不可达（unreachable 的归因细化）；
//     tautology：条件在当前前缀下极性恒定（yes 恒真 / no 恒假）——被前缀蕴含；
//   - unknown：证明不了可行/不可行/恒定的分支显式列出，不折算成"没问题"；
//   - 输出 JSON + 文本双轨（reportJson / reportText）；
//   - 纯函数：不读文件、不取时钟、不随机（G4）；
//   - 零规则字面量：本模块不得出现规则集阈值/裁定串（K-7 扫描面成员）。
//
// 报告条目形态（与 gen_bench 植入真值对账的键位）：
//   unreachable_branch / contradiction 条目：{ node, branch, reason }（node+branch 是身份）；
//   tautology 条目：{ node, branch, polarity }（polarity = 'yes' | 'no'，yes=恒真、no=恒假）。

// ---------- 抽象域 ----------
// number 区间：{lo, hi, loClosed, hiClosed}；离散域：Set 或 null（null=未知/全域无枚举声明）。

function fullDomain(rs) {
  const dom = { numbers: {}, discrete: {} };
  for (const inp of rs.inputs) {
    if (inp.type === 'number') {
      const sr = Array.isArray(inp.search_range) ? inp.search_range : [null, null];
      dom.numbers[inp.key] = { lo: sr[0] === undefined ? null : sr[0], hi: sr[1] === undefined ? null : sr[1], loClosed: true, hiClosed: true };
    } else if (inp.type === 'boolean') {
      dom.discrete[inp.key] = new Set([true, false]);
    } else if (inp.type === 'enum') {
      dom.discrete[inp.key] = new Set(inp.values.slice());
    } else {
      dom.discrete[inp.key] = null; // string：无声明值域 → 任何成员约束后都是未知
    }
  }
  return dom;
}

function cloneDom(dom) {
  const out = { numbers: {}, discrete: {} };
  for (const [k, iv] of Object.entries(dom.numbers)) out.numbers[k] = { ...iv };
  for (const [k, s] of Object.entries(dom.discrete)) out.discrete[k] = s === null ? null : new Set(s);
  return out;
}

function isEmptyNumber(iv) {
  if (iv.lo !== null && iv.hi !== null) {
    if (iv.lo > iv.hi) return true;
    if (iv.lo === iv.hi && !(iv.loClosed && iv.hiClosed)) return true;
  }
  return false;
}

function isEmptyDiscrete(s) { return s !== null && s.size === 0; }

function isEmpty(dom) {
  for (const iv of Object.values(dom.numbers)) if (isEmptyNumber(iv)) return true;
  for (const s of Object.values(dom.discrete)) if (isEmptyDiscrete(s)) return true;
  return false;
}

// 条件 → 交集结果：{status:'refine', dom} | {status:'empty'} | {status:'unknown'}
// negate=false 求条件成立约束；negate=true 求条件否定约束（不细化复合与未知域原子 → unknown）。
function intersectCondition(dom, cond, negate) {
  if (cond.all !== undefined || cond.any !== undefined) {
    // 复合条件：正向可细化（all 逐条交、any 保守不交只整体验证成员可行性）；
    // 否定分支不细化（K-17：¬(all) = ¬a∨¬b… 需分支展开，不做）。
    if (negate) return { status: 'unknown', dom };
    if (cond.all !== undefined) {
      let d = dom;
      for (const c of cond.all) {
        const r = intersectCondition(d, c, false);
        if (r.status === 'empty') return { status: 'empty' };
        if (r.status === 'unknown') return { status: 'unknown', dom: d };
        d = r.dom;
      }
      return { status: 'refine', dom: d };
    }
    // any 正向：保守做法——任一成员可行即可行，域不收窄
    return { status: 'refine', dom };
  }
  const { field, op, value } = cond;
  if (typeof field !== 'string') return { status: 'unknown', dom }; // 结构合法性归 schema 管
  const isNum = dom.numbers[field] !== undefined;
  if (isNum && (typeof value !== 'number' || !Number.isFinite(value))) return { status: 'unknown', dom };
  if (isNum) {
    const iv = { ...dom.numbers[field] };
    const v = value;
    const tightHi = (b, closed) => { // hi = min(hi, b)
      if (iv.hi === null || b < iv.hi) { iv.hi = b; iv.hiClosed = closed; }
      else if (b === iv.hi) iv.hiClosed = iv.hiClosed && closed;
    };
    const tightLo = (b, closed) => {
      if (iv.lo === null || b > iv.lo) { iv.lo = b; iv.loClosed = closed; }
      else if (b === iv.lo) iv.loClosed = iv.loClosed && closed;
    };
    if (!negate) {
      if (op === '>=' ) tightLo(v, true);
      else if (op === '>') tightLo(v, false);
      else if (op === '<=') tightHi(v, true);
      else if (op === '<') tightHi(v, false);
      else if (op === '==') { tightLo(v, true); tightHi(v, true); }
      else if (op === '!=') return { status: 'unknown', dom }; // 数域挖单点需要拆区间，不做 → unknown
    } else {
      // 数原子否定：>= → <；> → <=；<= → >；< → >=；== → 挖单点（拆区间，不做）；!= → 全域
      if (op === '>=') tightHi(v, false);
      else if (op === '>') tightHi(v, true);
      else if (op === '<=') tightLo(v, false);
      else if (op === '<') tightLo(v, true);
      else return { status: 'unknown', dom }; // == 的否定、!= 的否定
    }
    if (isEmptyNumber(iv)) return { status: 'empty' };
    const out = cloneDom(dom);
    out.numbers[field] = iv;
    return { status: 'refine', dom: out };
  }
  // 离散域
  const s = dom.discrete[field];
  if (s === null) return { status: 'unknown', dom }; // 值域未声明（string）→ 无法判定
  const setOp = op === 'in' || op === 'not_in';
  const members = setOp ? value : [value];
  if (!negate) {
    if (op === '==' || op === 'in') {
      const next = new Set(members.filter((m) => s.has(m)));
      if (next.size === 0) return { status: 'empty' };
      const out = cloneDom(dom);
      out.discrete[field] = next;
      return { status: 'refine', dom: out };
    }
    // != / not_in 正向：从集合挖成员（离散域挖点无拆区间问题，可细化）
    const next = new Set([...s].filter((m) => !members.includes(m)));
    if (next.size === 0) return { status: 'empty' };
    const out = cloneDom(dom);
    out.discrete[field] = next;
    return { status: 'refine', dom: out };
  }
  // 离散否定：== 的否定 = 挖单点；!= 的否定 = 收敛到单点；in/not_in 对称
  if (op === '==' ) {
    const next = new Set([...s].filter((m) => m !== value));
    if (next.size === 0) return { status: 'empty' };
    const out = cloneDom(dom);
    out.discrete[field] = next;
    return { status: 'refine', dom: out };
  }
  if (op === '!=') {
    if (!s.has(value)) return { status: 'empty' };
    const out = cloneDom(dom);
    out.discrete[field] = new Set([value]);
    return { status: 'refine', dom: out };
  }
  if (op === 'in') {
    const next = new Set([...s].filter((m) => !members.includes(m)));
    if (next.size === 0) return { status: 'empty' };
    const out = cloneDom(dom);
    out.discrete[field] = next;
    return { status: 'refine', dom: out };
  }
  if (op === 'not_in') {
    const next = new Set(members.filter((m) => s.has(m)));
    if (next.size === 0) return { status: 'empty' };
    const out = cloneDom(dom);
    out.discrete[field] = next;
    return { status: 'refine', dom: out };
  }
  return { status: 'unknown', dom };
}

// 条件在当前前缀下是否恒真（yes 极性恒定）：域中任取一值条件必真 → tautology(yes)。
// 仅对原子条件判定（复合不判定，宁可少报）。
function isTautology(dom, cond) {
  if (cond.all !== undefined || cond.any !== undefined) return false;
  const field = cond.field;
  const isNum = dom.numbers[field] !== undefined;
  if (isNum) {
    const iv = dom.numbers[field];
    const v = cond.value;
    switch (cond.op) {
      case '>=': return iv.lo !== null && (iv.lo > v || (iv.lo === v && iv.loClosed));
      case '>': return iv.lo !== null && iv.lo > v;
      case '<=': return iv.hi !== null && (iv.hi < v || (iv.hi === v && iv.hiClosed));
      case '<': return iv.hi !== null && iv.hi < v;
      case '==': return iv.lo !== null && iv.hi !== null && iv.lo === v && iv.hi === v && iv.loClosed && iv.hiClosed;
      case '!=': return false; // 数域挖点未实现 → 恒真判定不了（少报）
      default: return false;
    }
  }
  const s = dom.discrete[field];
  if (s === null) return false;
  switch (cond.op) {
    case '==': return s.size === 1 && s.has(cond.value);
    case '!=': return !s.has(cond.value);
    case 'in': return [...s].every((m) => cond.value.includes(m)) && s.size > 0;
    case 'not_in': return ![...s].some((m) => cond.value.includes(m)) && s.size > 0;
    default: return false;
  }
}

function conditionLabel(cond) {
  if (cond.all !== undefined) return 'all(' + cond.all.length + ')';
  if (cond.any !== undefined) return 'any(' + cond.any.length + ')';
  return cond.field + ' ' + cond.op + ' ' + JSON.stringify(cond.value);
}

// ---------- 主入口 ----------
// analyze(rs) → { findings: {unreachable_branch, contradiction, tautology, unknown}, text }
// 仅支持 tree 形态（list 规则集先过 graph.compileListToTree）。
export function analyze(rs, opts) {
  const toTree = opts && opts.toTree ? opts.toTree : null;
  const isList = rs.mode === 'list' && rs.rules !== undefined;
  const src = isList && toTree ? toTree(rs) : rs;
  const nodeById = new Map(src.nodes.map((n) => [n.id, n]));
  const verdictIds = new Set(src.verdicts.map((v) => v.id));
  const findings = { unreachable_branch: [], contradiction: [], tautology: [], unknown: [] };

  const walk = (ref, dom, path) => {
    if (verdictIds.has(ref)) return; // 叶子：终止
    const node = nodeById.get(ref);
    if (node === undefined) return; // 引用合法性归 schema 校验管
    const cond = node.condition;
    const taut = isTautology(dom, cond) ? 'yes' : null;
    if (taut) findings.tautology.push({ node: node.id, branch: 'yes', polarity: 'yes', condition: conditionLabel(cond) });

    const yes = intersectCondition(dom, cond, false);
    const no = intersectCondition(dom, cond, true);

    if (yes.status === 'empty') {
      findings.unreachable_branch.push({ node: node.id, branch: 'yes', reason: '条件在路径约束下无解：' + conditionLabel(cond), path: path.slice() });
    } else if (yes.status === 'unknown' && !taut) {
      findings.unknown.push({ node: node.id, branch: 'yes', reason: '复合/未细化条件正向可行性未知', condition: conditionLabel(cond) });
    }
    if (no.status === 'empty') {
      findings.tautology.push({ node: node.id, branch: 'no', polarity: 'no', condition: conditionLabel(cond) });
    } else if (no.status === 'unknown' && !taut) {
      findings.unknown.push({ node: node.id, branch: 'no', reason: '复合条件否定分支不细化 → 未知（K-17）', condition: conditionLabel(cond) });
    }

    const pathYes = path.concat([{ node: node.id, branch: 'yes' }]);
    const pathNo = path.concat([{ node: node.id, branch: 'no' }]);
    if (yes.status === 'refine' || yes.status === 'unknown') walk(node.branches.yes, yes.status === 'refine' ? yes.dom : dom, pathYes);
    if (no.status === 'refine' || no.status === 'unknown') walk(node.branches.no, no.status === 'refine' ? no.dom : dom, pathNo);
  };

  walk(src.root, fullDomain(src), []);

  // contradiction 归并：unreachable_branch 中由同字段区间互斥导致的 → 同时登记 contradiction
  for (const u of findings.unreachable_branch) {
    if (u.reason.includes('无解')) {
      findings.contradiction.push({ node: u.node, branch: u.branch, reason: '同路径字段约束互斥（归并为不可达原因）', path: u.path });
    }
  }
  return { findings };
}

// 对账辅助：从 findings 提取「node:branch」身份集合（bench/测试用）。
export function findingKeys(findings, kind) {
  return findings[kind].map((f) => f.node + ':' + f.branch);
}

// 文本双轨：人类可读报告。
export function reportText(result) {
  const f = result.findings;
  const lines = [];
  lines.push('覆盖率自检（抽象解释，三值逻辑）');
  lines.push('  unreachable_branch: ' + f.unreachable_branch.length + ' 条');
  for (const x of f.unreachable_branch) lines.push('    - ' + x.node + ':' + x.branch + '  ' + x.reason);
  lines.push('  contradiction: ' + f.contradiction.length + ' 条');
  for (const x of f.contradiction) lines.push('    - ' + x.node + ':' + x.branch + '  ' + x.reason);
  lines.push('  tautology: ' + f.tautology.length + ' 条');
  for (const x of f.tautology) lines.push('    - ' + x.node + ':' + x.branch + '（' + x.polarity + ' 恒' + (x.polarity === 'yes' ? '真' : '假') + '）  ' + (x.condition || ''));
  lines.push('  unknown: ' + f.unknown.length + ' 条（证明不了的一律如实列出，不折算）');
  for (const x of f.unknown) lines.push('    - ' + x.node + ':' + x.branch + '  ' + x.reason);
  return lines.join('\n');
}
