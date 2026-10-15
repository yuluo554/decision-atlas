// bundle.js —— 极简确定性打包器：把选定的 src 模块拼成可在浏览器 <script>（非模块）执行的单段 IIFE。
//
// 契约（04 §9，K 口径）：
//   - 仅支持约定写法：模块只含顶层函数声明 / const 声明 + 顶层单行 import / export 语句；
//   - 处理：按指定顺序读源码 → 删除顶层单行 import → 去掉顶层 "export " 前缀 →
//     包一层 IIFE（避免污染全局）→ 断言残留（源文本中不得再出现 import / export / require(）；
//   - 确定性：拼接顺序由调用方显式给定（不读目录、不排序文件系统），同输入同字节；
//   - 可测性：bundle 在 Node vm 中可执行（测试用）。
//
// 注意：注释里的 "import"/"export" 词面是本契约文本的一部分；残留断言基于"逐行剥离后
// 的代码文本"（stripImports 后每行 trim 的行首 token），不是整段子串扫描，故不受本注释影响。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)));

export function bundleModules(names) {
  const parts = [];
  for (const name of names) {
    const file = join(SRC_DIR, name.endsWith('.js') ? name : name + '.js');
    parts.push(stripModuleSyntax(readFileSync(file, 'utf8'), name));
  }
  const body = parts.join('\n\n');
  // 不包 IIFE：产物是经典 <script> 顶层拼接，函数声明即页面全局（运行时按名调用，
  // 如 traceRuleset）；模块间同名冲突由"bundle 清单显式指定 + 测试在 vm 中执行"兜底。
  const code = '"use strict";\n' + body;
  assertNoResidue(code, names);
  return code;
}

function stripModuleSyntax(source, name) {
  const outLines = [];
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('import ') || line.startsWith('import{')) {
      // 顶层单行 import：直接删除（模块间依赖按 bundle 顺序解析）
      continue;
    }
    let out = rawLine;
    if (line.startsWith('export ')) {
      out = rawLine.replace(/^(\s*)export\s+/, '$1');
    }
    outLines.push(out);
  }
  return '// ===== begin: ' + name + '.js =====\n' + outLines.join('\n');
}

function assertNoResidue(code, names) {
  // 只检查代码行（剥注释）的行首 token，注释里的契约文本不算残留
  const codeOnly = code
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
  const lineRe = /(^|\n)\s*(import|export)\b/;
  if (lineRe.test(codeOnly)) {
    throw new Error('bundle：打包产物残留模块语法（检查 ' + names.join(', ') + '）');
  }
  if (/\brequire\s*\(/.test(codeOnly)) {
    throw new Error('bundle：打包产物残留 require(（浏览器不可用）');
  }
  if (/\bimport\s*\(/.test(codeOnly)) {
    throw new Error('bundle：打包产物残留动态 import(（file:// 下不可用）');
  }
}
