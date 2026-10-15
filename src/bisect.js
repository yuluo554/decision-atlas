// bisect.js —— 阈值二分（临界点定位，04 §6，M2）。
//
// 契约：
//   - 目标函数 g_f(v) = trace(A[f:=v]).verdict.id（全裁定函数：其他字段固定在基准案例 A 的值）；
//   - 前置：f 出现在 ≥1 条件中且声明 search_range=[lo,hi]；否则 → {status:"skip", reason}（不猜范围）；
//   - 两段独立可复现：粗扫 N=256 等距点（含端点）找相邻异值对 → 每对细二分至 b-a ≤ ε（ε=1e-6）；
//   - 报告全部转折（上限 15，超出 → status:"too_many"）；0 转折 → status:"no_boundary"（合法结论）；
//   - 证据自足：每条边界 {field, v_star, v_plus_eps, verdict_at, verdict_plus_eps}——
//     第三方复核判据：g(v_star) ≠ g(v_plus_eps) 且 v_plus_eps - v_star ≤ ε；
//   - 不做单调性假设：多转折逐一如实报告；
//   - 纯函数：不读文件、不取时钟、不随机（G4）。
import { traceRuleset, traceListRuleset } from './engine.js';

const COARSE_N = 256;
const EPS = 1e-6;
// 转折上限：刻意避开全部基准包阈值取值（零规则字面量门禁按规则集派生禁用数字清单，
// 方法常量不得与任何规则数值撞车——K-7 纪律的延伸）。
const MAX_BOUNDARIES = 15;

// 收集规则集中引用了字段 f 的条件（复合递归展开）。
export function fieldIsReferenced(cond, field) {
  if (cond.all !== undefined) return cond.all.some((c) => fieldIsReferenced(c, field));
  if (cond.any !== undefined) return cond.any.some((c) => fieldIsReferenced(c, field));
  return cond.field === field;
}

// 从规则集（tree 或 list）提取全部条件节点。
function allConditions(rs) {
  const conds = [];
  if (rs.mode === 'list') {
    for (const r of rs.rules) conds.push(r.when);
  } else {
    for (const n of rs.nodes) conds.push(n.condition);
  }
  return conds;
}

export function bisectField(rs, caseA, field, opts) {
  const eps = opts && opts.eps !== undefined ? opts.eps : EPS;
  const coarseN = opts && opts.coarseN !== undefined ? opts.coarseN : COARSE_N;
  const input = rs.inputs.find((i) => i.key === field);
  if (input === undefined) return { field, status: 'skip', reason: '字段未在 inputs 声明' };
  if (input.type !== 'number') return { field, status: 'skip', reason: '仅 number 字段支持二分（实际类型 ' + input.type + '）' };
  const referenced = allConditions(rs).some((c) => fieldIsReferenced(c, field));
  if (!referenced) return { field, status: 'skip', reason: '字段未出现在任何条件中' };
  if (!Array.isArray(input.search_range)) return { field, status: 'skip', reason: '未声明 search_range（不猜范围）' };
  const lo = input.search_range[0];
  const hi = input.search_range[1];

  const g = (v) => {
    const t = rs.mode === 'list' ? traceListRuleset(rs, { ...caseA, [field]: v }) : traceRuleset(rs, { ...caseA, [field]: v });
    return t.verdict.id;
  };

  // 粗扫：等距采样（含端点）
  const sample = (i) => lo + ((hi - lo) * i) / coarseN;
  const transitions = [];
  let prevV = sample(0);
  let prevG = g(prevV);
  for (let i = 1; i <= coarseN; i++) {
    const v = sample(i);
    const gv = g(v);
    if (gv !== prevG) transitions.push([prevV, v]);
    prevV = v;
    prevG = gv;
  }
  if (transitions.length === 0) return { field, status: 'no_boundary', search_range: [lo, hi], coarse_n: coarseN };
  if (transitions.length > MAX_BOUNDARIES) {
    return { field, status: 'too_many', transitions: transitions.length, search_range: [lo, hi], max: MAX_BOUNDARIES };
  }

  // 细二分：每对 (a, b) 收缩至 b-a ≤ ε；g(a) ≠ g(b) 由粗扫保证、区间性质在细二分中保持
  const boundaries = [];
  for (const [a0, b0] of transitions) {
    let a = a0;
    let b = b0;
    while (b - a > eps) {
      const mid = a + (b - a) / 2;
      if (g(mid) === g(a)) a = mid;
      else b = mid;
    }
    boundaries.push({
      field,
      v_star: a,
      v_plus_eps: b,
      verdict_at: g(a),
      verdict_plus_eps: g(b),
    });
  }
  return { field, status: 'ok', search_range: [lo, hi], coarse_n: coarseN, eps, boundaries };
}

// 对规则集全部 number 字段跑二分（CLI 驱动用）。
export function bisectAll(rs, caseA, opts) {
  return rs.inputs.map((inp) => bisectField(rs, caseA, inp.key, opts));
}
