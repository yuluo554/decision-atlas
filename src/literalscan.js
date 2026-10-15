// literalscan.js —— 零规则字面量门禁的派生器（K-7，03 G3）。
//
// 契约：
//   - deriveBannedTokens(rulesets)：从规则集数组派生禁用 token 清单——
//     数值阈值（条件值，含 30/60 等任意出现于规则集的有限数）、枚举值、裁定 id、输入 key、规则/节点 id；
//   - scanLiterals(sourceText, tokens, {path})：扫描源码文本（含注释行，不豁免）命中即返回清单；
//     排除自身词在哨兵文本中的出现（阳性对照靠真实命中验证）；
//   - 设计：规则集是数据，引擎是通用求值器——引擎源码出现任何规则集专属 token 即可疑
//     （规则被硬编码进了代码，违反"数值阈值只在规则集定义一处"纪律）。
//
// 误报控制：极短 token（长度 < 3）与纯数字 0/1/2 一类高频代码常量不纳入——
// 阈值类 token 一律按「整词十进制数或含字母/下划线的字符串」形态匹配。
export function deriveBannedTokens(rulesets) {
  const numeric = new Set();
  const words = new Set();
  const addCond = (cond) => {
    if (cond.all !== undefined) { cond.all.forEach(addCond); return; }
    if (cond.any !== undefined) { cond.any.forEach(addCond); return; }
    if (typeof cond.value === 'number') numeric.add(String(cond.value));
    else if (typeof cond.value === 'string' && cond.value.length >= 3) words.add(cond.value);
    else if (Array.isArray(cond.value)) {
      for (const v of cond.value) {
        if (typeof v === 'number') numeric.add(String(v));
        else if (typeof v === 'string' && v.length >= 3) words.add(v);
      }
    }
  };
  for (const rs of rulesets) {
    for (const inp of rs.inputs || []) {
      if (inp.key.length >= 3) words.add(inp.key);
      for (const v of inp.values || []) if (v.length >= 3) words.add(v);
    }
    for (const v of rs.verdicts || []) if (v.id.length >= 3) words.add(v.id);
    if (rs.default_verdict && rs.default_verdict.length >= 3) words.add(rs.default_verdict);
    for (const n of rs.nodes || []) {
      if (n.id.length >= 3) words.add(n.id);
      addCond(n.condition);
    }
    for (const r of rs.rules || []) {
      if (r.id.length >= 3) words.add(r.id);
      addCond(r.when);
    }
  }
  // 高频代码常量排除：0/1/2 等单位数与整十（10/20/100 等仍保留——阈值敏感）；
  // 另排除 ε 精度约定一类的极小数（1e-6/1e-9 等非规则阈值，是数值方法常量不是规则）。
  for (const n of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) numeric.delete(n);
  for (const n of [...numeric]) {
    const v = Number(n);
    if (v !== 0 && Math.abs(v) < 1e-3) numeric.delete(n);
  }
  return { numeric: [...numeric], words: [...words] };
}

// 扫描源码文本（逐行、含注释行）。返回命中 [{token, line}]。
// 数字 token 按「行中独立数字字面量」匹配（避免 12 命中 120 的子串误报）；词 token 按标识符整词匹配。
export function scanLiterals(sourceText, banned) {
  const hits = [];
  const numericRe = new RegExp('(?<![A-Za-z0-9_.])(' + banned.numeric.map(escapeRe).join('|') + ')(?![0-9_.])');
  const wordsRe = new RegExp('(?<![A-Za-z0-9_])(' + banned.words.map(escapeRe).join('|') + ')(?![A-Za-z0-9_])');
  const lines = sourceText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (banned.numeric.length > 0 && numericRe.test(line)) {
      hits.push({ token: line.match(numericRe)[1], line: i + 1 });
    }
    if (banned.words.length > 0 && wordsRe.test(line)) {
      hits.push({ token: line.match(wordsRe)[1], line: i + 1 });
    }
  }
  return hits;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
