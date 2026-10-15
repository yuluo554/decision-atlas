// hygiene.test.js —— 仓库卫生守门（G3/G4/G6 纪律的骨架期形态）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function trackedFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

test('CR 守门：已跟踪文本文件不含 CR 字节（G6，LF 纪律）', () => {
  const textExt = /\.(js|json|md|yml|yaml|html|css|txt|gitattributes|gitignore|toml)$/;
  for (const f of trackedFiles()) {
    const isText = textExt.test(f) || !f.includes('.');
    if (!isText) continue;
    const buf = readFileSync(join(ROOT, f));
    assert.ok(!buf.includes(0x0d), '文件含 CR 字节（应为 LF）：' + f);
  }
});

test('G4：src/ 与 tools/ 源码禁时钟与随机（确定性纪律）', () => {
  const banned = [/\bDate\.now\s*\(/, /new\s+Date\s*\(/, /\bMath\.random\s*\(/];
  for (const f of trackedFiles()) {
    if (!/^src\/.*\.js$/.test(f) && !/^tools\/.*\.js$/.test(f)) continue;
    const src = readFileSync(join(ROOT, f), 'utf8');
    for (const re of banned) {
      // 允许出现在注释行（// 或 * 开头的行）——扫描逐行跳过纯注释
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        assert.ok(!re.test(line), f + ':' + (i + 1) + ' 命中禁用模式 ' + re + '（src/tools 禁时钟与随机）');
      }
    }
  }
});

test('G3 雏形：engine.js 零规则字面量（阈值只存在于规则集）', () => {
  // 骨架期口径：引擎源码不得出现样例规则集的数值阈值/枚举字面量（30/100/silver/gold/bronze…）。
  // M2 建立正式门禁：从规则集自动派生禁用 token 清单（含年度数字）+ selftest 阳性对照。
  const engineSrc = readFileSync(join(ROOT, 'src/engine.js'), 'utf8');
  for (const token of ['silver', 'gold', 'bronze', 'playoff', 'direct']) {
    assert.ok(!engineSrc.includes(token), 'engine.js 含规则字面量 token：' + token);
  }
});
