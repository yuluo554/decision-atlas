// yaml.js —— YAML 文档化子集解析器（D-03：子集 + 越界显式报错，绝不猜测）。
//
// **子集清单（冻结口径，先于实现写入文档——范围失控防线）**：
//   仅接受以下语法，用于手写规则集/案例文件：
//   1. 顶层到嵌套均为「键: 值」映射，缩进以空格计（每层固定 2 空格或一致即可，禁 Tab）；
//   2. 标量：双引号/单引号字符串、整数、有限小数、true/false、null（→ 不允许出现在规则集语义位置）；
//   3. 行内流式数组：[a, b, c]（元素为标量或行内对象 {k: v}）；
//   4. 行内对象：{key: value, ...}；
//   5. 块数组：`- ` 列表项（值可为标量/嵌套映射/行内集合）；
//   6. 嵌套映射靠缩进表达；同一映射的键必须同缩进；
//   7. 注释：`#` 起整行注释；值后注释仅当 ` #`（前有空格）时剥离（字符串字面量内的 # 保留）；
//   8. 文档为单文档（禁 `---` 分隔多文档；允许首行 `---`）。
//   **明确不支持**（命中即 E_YAML_UNSUPPORTED → 调用方 exit 2）：锚点/别名（& *）、
//   多行字符串（| >）、标签（!!）、引号转义（\n 等）、多文档、Tab 缩进、flow 嵌套跨行、
//   重复键、: 无空格的键值、无引号字符串含特殊字符（: , [ ] { } # 前导）。
//
// 行为契约：
//   - parseYaml(text) → JS 值；任何越界 → 抛 YamlError（携带行号与原因）；调用方（atlas CLI）捕获批 E_YAML_* 后 exit 2；
//   - 规则集场景的语义校验仍由 schema.js 承担（本模块只管语法形态）；
//   - 确定性：纯函数，无时钟无随机（G4）。
//
// 实现：手写递归下降（行驱动的块解析 + 行内 flow 解析），零第三方依赖（D-02）。

export class YamlError extends Error {
  constructor(message, line) {
    super('E_YAML_' + message + (line === undefined ? '' : '（第 ' + line + ' 行）'));
    this.name = 'YamlError';
    this.code = 'E_YAML_' + message.split('：')[0];
    this.line = line;
  }
}

export function parseYaml(text) {
  const rawLines = text.split('\n');
  // 剥注释（含引号感知）+ 丢空行；行号保留用于报错
  const lines = [];
  let docStart = false;
  for (let i = 0; i < rawLines.length; i++) {
    let line = stripComment(rawLines[i], i);
    if (line.trim() === '---') {
      if (lines.length === 0 && !docStart) { docStart = true; continue; }
      throw new YamlError('UNSUPPORTED：多文档（---）', i + 1);
    }
    if (line.trim() === '...') continue;
    if (/\t/.test(line)) throw new YamlError('UNSUPPORTED：Tab 缩进', i + 1);
    if (line.trim() !== '') lines.push({ text: line, no: i + 1 });
  }
  if (lines.length === 0) throw new YamlError('EMPTY：空文档');
  const pos = { i: 0 };
  const value = parseBlock(lines, pos, indentOf(lines[0]), -1);
  if (pos.i < lines.length) {
    throw new YamlError('INDENT：第 ' + (pos.i + 1) + ' 行缩进不一致（期望 ' + indentOf(lines[pos.i]) + '）', lines[pos.i].no);
  }
  return value;
}

// ---------- 行预处理 ----------
function stripComment(line, lineNo) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inD) inS = !inS;
    else if (ch === '"' && !inS) inD = !inD;
    else if (ch === '#' && !inS && !inD) {
      if (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t' || isKeyStart(line, i)) {
        return line.slice(0, i);
      }
    }
  }
  return line;
}
function isKeyStart(line, hashPos) {
  // 行首 "#..."（无前置空格）也视为注释（宽容口径：# 出现在引号外且前方非引号内容字符）
  const before = line.slice(0, hashPos).trim();
  return before === '';
}

// ---------- 块解析（缩进驱动） ----------
function parseBlock(lines, pos, minIndent, parentIndent) {
  const line = lines[pos.i];
  const indent = indentOf(line);
  if (indent < minIndent) throw new YamlError('INDENT：意外缩进', line.no);
  if (isItemLine(line)) return parseBlockSeq(lines, pos, indent);
  return parseBlockMap(lines, pos, indent);
}

function parseBlockMap(lines, pos, indent) {
  const obj = {};
  const seen = new Set();
  while (pos.i < lines.length) {
    const line = lines[pos.i];
    const ind = indentOf(line);
    if (ind < indent) break;
    if (ind > indent) throw new YamlError('INDENT：映射键缩进不一致', line.no);
    if (isItemLine(line)) throw new YamlError('INDENT：映射位置出现列表项', line.no);
    const kv = splitKey(trimmedOf(line), line.no);
    if (seen.has(kv.key)) throw new YamlError('DUPKEY：重复键 ' + kv.key, line.no);
    seen.add(kv.key);
    pos.i++;
    obj[kv.key] = kv.inlineRest.trim() !== ''
      ? parseFlowOrThrow(kv.inlineRest.trim(), line.no)
      : parseNested(lines, pos, indent, line.no, kv.key);
  }
  return obj;
}

function parseBlockSeq(lines, pos, indent) {
  const arr = [];
  while (pos.i < lines.length) {
    const line = lines[pos.i];
    const ind = indentOf(line);
    if (ind < indent) break;
    if (ind > indent) throw new YamlError('INDENT：列表项缩进不一致', line.no);
    if (!isItemLine(line)) break;
    const rest = trimmedOf(line).slice(1).trim();
    pos.i++;
    if (rest !== '') {
      if (hasTopLevelColon(rest)) {
        // 「- key: value」= 列表项内嵌映射：改写该行为缩进 +2 的映射行后按映射解析
        lines[pos.i - 1] = { text: ' '.repeat(indent + 2) + rest, no: line.no };
        pos.i--;
        arr.push(parseBlockMap(lines, pos, indent + 2));
      } else {
        arr.push(parseFlowOrThrow(rest, line.no));
      }
    } else {
      if (pos.i >= lines.length) throw new YamlError('EMPTY：列表项缺值', line.no);
      const next = lines[pos.i];
      if (indentOf(next) <= indent) throw new YamlError('INDENT：列表项缺值', line.no);
      arr.push(parseBlock(lines, pos, indentOf(next), indent));
    }
  }
  return arr;
}

// 值位置换行嵌套：子映射 / 子列表 / 空值
function parseNested(lines, pos, parentIndent, lineNo, key) {
  if (pos.i >= lines.length) throw new YamlError('EMPTY：键 ' + key + ' 缺值', lineNo);
  const next = lines[pos.i];
  const nextIndent = indentOf(next);
  if (nextIndent <= parentIndent) return null; // 空值（null）——语义校验交给 schema
  if (nextIndent - parentIndent !== 2) {
    throw new YamlError('INDENT：嵌套层须恰为 2 空格（键 ' + key + '）', next.no);
  }
  return parseBlock(lines, pos, nextIndent, parentIndent);
}

// ---------- 行内 flow 解析 ----------
function parseFlowOrThrow(text, lineNo) {
  if (text.startsWith('- ')) throw new YamlError('FLOW：行内混排块列表项', lineNo);
  const p = new FlowParser(text, lineNo);
  const v = p.parseValue();
  p.skipWs();
  if (!p.eof()) throw new YamlError('FLOW：值后有多余内容「' + p.rest() + '」', lineNo);
  return v;
}

class FlowParser {
  constructor(text, lineNo) { this.s = text; this.i = 0; this.lineNo = lineNo; }
  eof() { return this.i >= this.s.length; }
  rest() { return this.s.slice(this.i); }
  skipWs() { while (!this.eof() && this.s[this.i] === ' ') this.i++; }
  fail(msg) { throw new YamlError(msg, this.lineNo); }
  parseValue() {
    this.skipWs();
    if (this.eof()) this.fail('FLOW：空值');
    const c = this.s[this.i];
    if (c === '[') return this.parseFlowSeq();
    if (c === '{') return this.parseFlowMap();
    if (c === '"' || c === "'") return this.parseQuoted();
    return this.parseScalar();
  }
  parseFlowSeq() {
    this.i++; // [
    const arr = [];
    this.skipWs();
    if (this.s[this.i] === ']') { this.i++; return arr; }
    for (;;) {
      arr.push(this.parseValue());
      this.skipWs();
      const c = this.s[this.i];
      if (c === ',') { this.i++; continue; }
      if (c === ']') { this.i++; return arr; }
      this.fail('FLOW：数组期望 , 或 ]');
    }
  }
  parseFlowMap() {
    this.i++; // {
    const obj = {};
    const seen = new Set();
    this.skipWs();
    if (this.s[this.i] === '}') { this.i++; return obj; }
    for (;;) {
      this.skipWs();
      const key = this.parseKey();
      if (seen.has(key)) this.fail('DUPKEY：重复键 ' + key);
      seen.add(key);
      this.skipWs();
      if (this.s[this.i] !== ':') this.fail('FLOW：对象期望 :');
      this.i++;
      obj[key] = this.parseValue();
      this.skipWs();
      const c = this.s[this.i];
      if (c === ',') { this.i++; continue; }
      if (c === '}') { this.i++; return obj; }
      this.fail('FLOW：对象期望 , 或 }');
    }
  }
  parseKey() {
    const c = this.s[this.i];
    if (c === '"' || c === "'") return this.parseQuoted();
    const start = this.i;
    while (!this.eof() && !':,[]{} '.includes(this.s[this.i])) this.i++;
    if (this.i === start) this.fail('FLOW：空键');
    return this.s.slice(start, this.i);
  }
  parseQuoted() {
    const q = this.s[this.i];
    this.i++;
    const start = this.i;
    while (!this.eof() && this.s[this.i] !== q) {
      if (this.s[this.i] === '\\') this.fail('UNSUPPORTED：引号转义');
      this.i++;
    }
    if (this.eof()) this.fail('QUOTE：字符串未闭合');
    const v = this.s.slice(start, this.i);
    this.i++;
    return v;
  }
  parseScalar() {
    const start = this.i;
    while (!this.eof() && !',]}:'.includes(this.s[this.i])) this.i++;
    const raw = this.s.slice(start, this.i).trim();
    if (raw === '') this.fail('FLOW：空标量');
    return scalarOf(raw, this.lineNo);
  }
}

// ---------- 标量与键值切分 ----------
function scalarOf(raw, lineNo) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null' || raw === '~') return null;
  if (/^[+-]?\d+$/.test(raw)) return Number(raw);
  if (/^[+-]?(\d+\.\d+|\.\d+|\d+\.)([eE][+-]?\d+)?$/.test(raw)) {
    const v = Number(raw);
    if (!Number.isFinite(v)) throw new YamlError('SCALAR：非有限数 ' + raw, lineNo);
    return v;
  }
  if (/^(0[xXoObB]|\.inf|\.nan|&|\*|!!)/.test(raw) || raw.includes('\n')) {
    throw new YamlError('UNSUPPORTED：不支持的字面量「' + raw + '」', lineNo);
  }
  if (raw === '|' || raw === '>' || /^[|>][+-]?\d*$/.test(raw)) {
    throw new YamlError('UNSUPPORTED：多行字符串（' + raw + '）', lineNo);
  }
  if (/[:,[\]{}#]/.test(raw) || raw.startsWith(' ') || raw.endsWith(' ')) {
    throw new YamlError('SCALAR：无引号字符串含特殊字符（需加引号）「' + raw + '」', lineNo);
  }
  return raw; // 无引号普通字符串（子集允许：字母/数字/下划线/中文等）
}

function splitKey(text, lineNo) {
  let inS = false, inD = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" && !inD) inS = !inS;
    else if (ch === '"' && !inS) inD = !inD;
    else if (ch === ':' && !inS && !inD) {
      if (i + 1 >= text.length || text[i + 1] === ' ') {
        return { key: unquoteKey(text.slice(0, i).trim(), lineNo), inlineRest: text.slice(i + 1) };
      }
    }
    if (ch === '[' || ch === '{') throw new YamlError('FLOW：键位置不允许行内集合开头', lineNo);
  }
  throw new YamlError('KEY：缺少「: 」（冒号后须有空格）', lineNo);
}

function unquoteKey(k, lineNo) {
  if (k === '') throw new YamlError('KEY：空键', lineNo);
  if ((k.startsWith('"') && k.endsWith('"') && k.length >= 2) || (k.startsWith("'") && k.endsWith("'") && k.length >= 2)) {
    if (k.slice(1, -1).includes('\\')) throw new YamlError('UNSUPPORTED：引号转义', lineNo);
    return k.slice(1, -1);
  }
  if (/["[],[\\]{}]/.test(k)) throw new YamlError('SCALAR：键含特殊字符（需加引号）「' + k + '」', lineNo);
  return k;
}


// ---------- 行辅助（纯函数，避免污染 String.prototype） ----------
function indentOf(line) { return line.text.length - line.text.trimStart().length; }
function trimmedOf(line) { return line.text.trim(); }
function isItemLine(line) { const t = line.text.trim(); return t.startsWith("- ") || t === "-"; }
function hasTopLevelColon(text) {
  let inS = false, inD = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" && !inD) inS = !inS;
    else if (ch === '"' && !inS) inD = !inD;
    else if (ch === ':' && !inS && !inD && (i + 1 >= text.length || text[i + 1] === ' ')) return true;
  }
  return false;
}
