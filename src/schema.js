// schema.js —— 规则集与案例校验（骨架 v0，schema v1 于 M1 冻结）。
//
// 契约（04 §1）：
//   - 校验失败 → 收集全部错误（错误码 + 提示）一次性报出；调用方拒绝进入求值路径；
//   - 绝不猜测补全（缺字段/非法值 = 显式错误码，不是默认值）；
//   - 错误码表：E_SCHEMA_VERSION / E_REQUIRED / E_TYPE / E_ID_DUP / E_ROOT_MISSING /
//     E_REF / E_CYCLE / E_UNREACHABLE / E_FIELD_UNKNOWN / E_OP / E_VALUE /
//     E_COMPOUND_EMPTY / E_SEARCH_RANGE / E_MODE / E_DEFAULT_MISSING /
//     E_CASE_MISSING / E_CASE_UNKNOWN / E_CASE_VALUE。
// v0 覆盖：tree 模式（显式节点树）+ 原子/复合条件 + 全量错误码；list 模式 M2 接入。

export const ERROR_CODES = Object.freeze([
  'E_SCHEMA_VERSION', 'E_REQUIRED', 'E_TYPE', 'E_ID_DUP', 'E_ROOT_MISSING',
  'E_REF', 'E_CYCLE', 'E_UNREACHABLE', 'E_FIELD_UNKNOWN', 'E_OP', 'E_VALUE',
  'E_COMPOUND_EMPTY', 'E_SEARCH_RANGE', 'E_MODE', 'E_DEFAULT_MISSING',
  'E_CASE_MISSING', 'E_CASE_UNKNOWN', 'E_CASE_VALUE',
]);

const OPS = {
  number: ['>=', '>', '<=', '<', '==', '!='],
  boolean: ['==', '!='],
  enum: ['==', '!=', 'in', 'not_in'],
  string: ['==', '!=', 'in', 'not_in'],
};

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function validateCondition(cond, inputTypes, inputValues, path, errors) {
  if (!isPlainObject(cond)) {
    errors.push({ code: 'E_TYPE', path, message: '条件必须是对象' });
    return;
  }
  if (Array.isArray(cond.all)) {
    if (cond.all.length === 0) errors.push({ code: 'E_COMPOUND_EMPTY', path: path + '.all', message: 'all 数组不得为空' });
    for (let i = 0; i < cond.all.length; i++) validateCondition(cond.all[i], inputTypes, inputValues, path + '.all[' + i + ']', errors);
    if (Object.keys(cond).length > 1) errors.push({ code: 'E_TYPE', path, message: 'all 条件不得混用其他键' });
    return;
  }
  if (Array.isArray(cond.any)) {
    if (cond.any.length === 0) errors.push({ code: 'E_COMPOUND_EMPTY', path: path + '.any', message: 'any 数组不得为空' });
    for (let i = 0; i < cond.any.length; i++) validateCondition(cond.any[i], inputTypes, inputValues, path + '.any[' + i + ']', errors);
    if (Object.keys(cond).length > 1) errors.push({ code: 'E_TYPE', path, message: 'any 条件不得混用其他键' });
    return;
  }
  if (cond.field === undefined || cond.op === undefined || cond.value === undefined) {
    errors.push({ code: 'E_REQUIRED', path, message: '原子条件必须含 field/op/value' });
    return;
  }
  if (Object.keys(cond).length > 3) errors.push({ code: 'E_TYPE', path, message: '原子条件只允许 field/op/value' });
  const { field, op, value } = cond;
  if (typeof field !== 'string') { errors.push({ code: 'E_TYPE', path: path + '.field', message: 'field 必须是字符串' }); return; }
  if (!inputTypes.has(field)) { errors.push({ code: 'E_FIELD_UNKNOWN', path: path + '.field', message: '未声明的输入字段 ' + field }); return; }
  const type = inputTypes.get(field);
  if (typeof op !== 'string' || !OPS[type].includes(op)) {
    errors.push({ code: 'E_OP', path: path + '.op', message: '字段 ' + field + '（' + type + '）不允许算子 ' + String(op) });
    return;
  }
  const setOp = op === 'in' || op === 'not_in';
  const single = setOp ? value : [value];
  if (setOp && !Array.isArray(value)) { errors.push({ code: 'E_VALUE', path: path + '.value', message: 'in/not_in 的 value 必须是数组' }); return; }
  for (const v of single) {
    let ok = false;
    if (type === 'number') ok = typeof v === 'number' && Number.isFinite(v);
    else if (type === 'boolean') ok = typeof v === 'boolean';
    else ok = typeof v === 'string';
    if (!ok) { errors.push({ code: 'E_VALUE', path: path + '.value', message: '字段 ' + field + ' 的条件值类型不符（应为 ' + type + '）' }); continue; }
    if (type === 'enum' && !inputValues.get(field).includes(v)) {
      errors.push({ code: 'E_VALUE', path: path + '.value', message: '枚举值 ' + JSON.stringify(v) + ' 不在字段 ' + field + ' 的 values 内' });
    }
  }
}

function collectRefs(branch, nodeIds, verdictIds, path, errors) {
  if (branch === undefined) return null;
  if (branch === '$default') return { isDefault: true };
  if (typeof branch !== 'string') { errors.push({ code: 'E_TYPE', path, message: '分支引用必须是字符串' }); return null; }
  if (nodeIds.has(branch) || verdictIds.has(branch)) return { ref: branch };
  errors.push({ code: 'E_REF', path, message: '分支引用悬空：' + branch });
  return null;
}

export function validateRuleset(rs) {
  const errors = [];
  if (!isPlainObject(rs)) return { ok: false, errors: [{ code: 'E_TYPE', path: '', message: '规则集必须是 JSON 对象' }] };
  if (rs.schema_version !== '1') {
    errors.push({ code: 'E_SCHEMA_VERSION', path: '.schema_version', message: 'schema_version 必须为 "1"，实际 ' + JSON.stringify(rs.schema_version) });
  }
  for (const k of ['ruleset_id', 'title', 'inputs', 'verdicts']) {
    if (rs[k] === undefined) errors.push({ code: 'E_REQUIRED', path: '.' + k, message: '缺少必填字段 ' + k });
  }
  if (errors.length > 0) return { ok: false, errors };

  const mode = rs.mode === undefined ? 'tree' : rs.mode;
  if (mode !== 'tree' && mode !== 'list') {
    errors.push({ code: 'E_MODE', path: '.mode', message: 'mode 必须是 tree 或 list' });
    return { ok: false, errors };
  }
  if (mode === 'list') {
    errors.push({ code: 'E_MODE', path: '.mode', message: 'list 模式 M2 接入（v0 仅支持 tree）' });
    return { ok: false, errors };
  }
  if (!Array.isArray(rs.nodes) || rs.nodes.length === 0) {
    errors.push({ code: 'E_REQUIRED', path: '.nodes', message: 'tree 模式需要非空 nodes 数组' });
    return { ok: false, errors };
  }

  // inputs
  const inputTypes = new Map();
  const inputValues = new Map();
  const inputKeys = new Set();
  rs.inputs.forEach((inp, i) => {
    const p = '.inputs[' + i + ']';
    if (!isPlainObject(inp)) { errors.push({ code: 'E_TYPE', p, message: 'input 必须是对象' }); return; }
    const { key, type, label, values, search_range } = inp;
    if (key === undefined || type === undefined || label === undefined) { errors.push({ code: 'E_REQUIRED', p, message: 'input 缺 key/type/label' }); return; }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) { errors.push({ code: 'E_VALUE', path: p + '.key', message: 'key 必须匹配 ^[A-Za-z_][A-Za-z0-9_]*$' }); return; }
    if (inputKeys.has(key)) { errors.push({ code: 'E_ID_DUP', path: p + '.key', message: 'input key 重复：' + key }); return; }
    inputKeys.add(key);
    if (!['number', 'boolean', 'enum', 'string'].includes(type)) { errors.push({ code: 'E_TYPE', path: p + '.type', message: '未知 type：' + type }); return; }
    inputTypes.set(key, type);
    if (type === 'enum') {
      // schema v1 冻结勘误（04 §1.2 同步）：enum 成员限字符串。v0 曾允许 number 成员，
      // 但案例校验对 enum 取值恒按 string 校验，number 成员将导致案例永远无法通过校验。
      if (!Array.isArray(values) || values.length === 0) {
        errors.push({ code: 'E_REQUIRED', path: p + '.values', message: 'enum 字段需要非空 values' });
      } else if (values.some((v) => typeof v !== 'string')) {
        errors.push({ code: 'E_VALUE', path: p + '.values', message: 'enum 成员必须是字符串（v1 冻结口径）' });
      } else inputValues.set(key, values);
    }
    if (search_range !== undefined) {
      if (type !== 'number') errors.push({ code: 'E_SEARCH_RANGE', path: p + '.search_range', message: '仅 number 字段允许 search_range' });
      else if (!Array.isArray(search_range) || search_range.length !== 2
        || !Number.isFinite(search_range[0]) || !Number.isFinite(search_range[1])
        || !(search_range[0] < search_range[1])) {
        errors.push({ code: 'E_SEARCH_RANGE', path: p + '.search_range', message: 'search_range 必须是 [lo, hi] 且 lo < hi' });
      }
    }
  });

  // verdicts
  const verdictIds = new Set();
  rs.verdicts.forEach((v, i) => {
    const p = '.verdicts[' + i + ']';
    if (!isPlainObject(v)) { errors.push({ code: 'E_TYPE', p, message: 'verdict 必须是对象' }); return; }
    if (v.id === undefined || v.label === undefined || v.kind === undefined) { errors.push({ code: 'E_REQUIRED', p, message: 'verdict 缺 id/label/kind' }); return; }
    if (verdictIds.has(v.id)) errors.push({ code: 'E_ID_DUP', path: p + '.id', message: 'verdict id 重复：' + v.id });
    verdictIds.add(v.id);
  });

  // nodes
  const nodeIds = new Set();
  rs.nodes.forEach((n, i) => {
    const p = '.nodes[' + i + ']';
    if (!isPlainObject(n)) { errors.push({ code: 'E_TYPE', p, message: 'node 必须是对象' }); return; }
    if (n.id === undefined || n.condition === undefined || n.branches === undefined) { errors.push({ code: 'E_REQUIRED', p, message: 'node 缺 id/condition/branches' }); return; }
    if (nodeIds.has(n.id)) errors.push({ code: 'E_ID_DUP', path: p + '.id', message: 'node id 重复：' + n.id });
    nodeIds.add(n.id);
  });
  if (verdictIds.size === 0) errors.push({ code: 'E_REQUIRED', path: '.verdicts', message: '至少需要一个裁定' });
  for (const nid of nodeIds) {
    if (verdictIds.has(nid)) errors.push({ code: 'E_ID_DUP', path: '.nodes', message: '节点 id 与裁定 id 冲突：' + nid });
  }
  if (errors.length > 0) return { ok: false, errors };

  // conditions + branches
  const edges = [];
  rs.nodes.forEach((n, i) => {
    const p = '.nodes[' + i + ']';
    validateCondition(n.condition, inputTypes, inputValues, p + '.condition', errors);
    const yes = collectRefs(n.branches.yes, nodeIds, verdictIds, p + '.branches.yes', errors);
    const no = collectRefs(n.branches.no, nodeIds, verdictIds, p + '.branches.no', errors);
    if (yes?.isDefault || no?.isDefault) {
      if (rs.default_verdict === undefined) errors.push({ code: 'E_DEFAULT_MISSING', path: p + '.branches', message: '使用 $default 哨兵但缺 default_verdict' });
      else if (!verdictIds.has(rs.default_verdict)) errors.push({ code: 'E_REF', path: '.default_verdict', message: 'default_verdict 不是已声明的裁定' });
    }
    if (yes?.ref) edges.push({ from: n.id, to: yes.ref });
    if (no?.ref) edges.push({ from: n.id, to: no.ref });
  });
  if (errors.length > 0) return { ok: false, errors };

  // root
  if (rs.root === undefined || (!nodeIds.has(rs.root) && !verdictIds.has(rs.root))) {
    errors.push({ code: 'E_ROOT_MISSING', path: '.root', message: 'root 缺失或指向不存在的节点/裁定' });
    return { ok: false, errors };
  }

  // cycle + reachability（root 为裁定节点时图无节点边，天然通过）
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...nodeIds].map((id) => [id, WHITE]));
  const reach = new Set();
  const dfs = (u) => {
    if (!nodeIds.has(u)) return; // 裁定叶子无出边
    color.set(u, GRAY);
    reach.add(u);
    for (const v of adj.get(u) || []) {
      if (!nodeIds.has(v)) continue;
      if (color.get(v) === GRAY) errors.push({ code: 'E_CYCLE', path: '.nodes', message: '树中存在环：经过 ' + v });
      else if (color.get(v) === WHITE) dfs(v);
    }
    color.set(u, BLACK);
  };
  if (nodeIds.has(rs.root)) dfs(rs.root);
  for (const id of nodeIds) {
    if (!reach.has(id)) errors.push({ code: 'E_UNREACHABLE', path: '.nodes', message: '节点从 root 不可达：' + id });
  }
  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}

export function validateCase(rs, caseObj) {
  const errors = [];
  if (!isPlainObject(caseObj)) return { ok: false, errors: [{ code: 'E_CASE_VALUE', path: '', message: '案例必须是 JSON 对象' }] };
  const known = new Set(rs.inputs.map((i) => i.key));
  const inputByKey = new Map(rs.inputs.map((i) => [i.key, i]));
  for (const k of Object.keys(caseObj)) {
    if (!known.has(k)) { errors.push({ code: 'E_CASE_UNKNOWN', path: '.' + k, message: '案例含未声明字段：' + k }); continue; }
    const inp = inputByKey.get(k);
    const v = caseObj[k];
    let ok = false;
    if (inp.type === 'number') ok = typeof v === 'number' && Number.isFinite(v);
    else if (inp.type === 'boolean') ok = typeof v === 'boolean';
    else ok = typeof v === 'string';
    if (!ok) { errors.push({ code: 'E_CASE_VALUE', path: '.' + k, message: '字段 ' + k + ' 的值类型不符（应为 ' + inp.type + '）' }); continue; }
    if (inp.type === 'enum' && !inp.values.includes(v)) {
      errors.push({ code: 'E_CASE_VALUE', path: '.' + k, message: '枚举值 ' + JSON.stringify(v) + ' 不在字段 ' + k + ' 的 values 内' });
    }
  }
  for (const k of known) {
    if (!(k in caseObj)) errors.push({ code: 'E_CASE_MISSING', path: '.' + k, message: '案例缺少字段：' + k });
  }
  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}
