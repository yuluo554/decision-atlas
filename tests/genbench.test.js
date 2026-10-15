// genbench.test.js —— M1 数据先行守门（05-数据计划 §四）：
//   1) 生成器双跑逐字节一致（确定性纪律，K-4）；
//   2) --check 红绿双向验证（一致 → 0；冻结件被改动 → 1）；
//   3) 真值库无 observed 类字段（自证空转防线，05 §三）；
//   4) 期望键结构守门（键名自带结论 + 取值恒 true）；
//   5) 全部冻结规则集过 schema v1 校验、全部冻结案例期望与引擎求值对账（真值 = 构造即真值）；
//   6) 反事实对 Δ 边集合 == path(base) Δ path(alt)（集合等式，04 §5 断言契约）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, copyFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateRuleset } from '../src/schema.js';
import { traceRuleset } from '../src/engine.js';
import { generateAll, stableJson, splitmix64 } from '../tools/gen_bench.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = join(ROOT, 'data', 'benchmark');

function listFiles(dirRel) {
  return readdirSync(join(BENCH, dirRel)).filter((f) => f.endsWith('.json')).sort();
}

test('splitmix64：同 seed 序列确定（自研 RNG 基线）', () => {
  const a = splitmix64(0x53594e42n);
  const b = splitmix64(0x53594e42n);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  assert.equal(typeof a(), 'bigint');
});

test('生成器双跑逐字节一致（K-4 确定性纪律）', () => {
  const g1 = generateAll();
  const g2 = generateAll();
  assert.equal(g1.files.length, g2.files.length);
  for (let i = 0; i < g1.files.length; i++) {
    assert.equal(g1.files[i].path, g2.files[i].path);
    assert.equal(g1.files[i].content, g2.files[i].content, '双跑不一致：' + g1.files[i].path);
  }
});

test('冻结产物与生成器输出逐字节一致（已冻结文件未脱钩）', () => {
  const { files } = generateAll();
  for (const f of files) {
    const onDisk = readFileSync(join(BENCH, f.path), 'utf8');
    assert.equal(onDisk, f.content, '冻结件与生成器输出不一致：' + f.path);
  }
});

test('--check 绿向：一致 → exit 0 且输出 FROZEN_OK', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen_bench.js'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, 'stdout=' + r.stdout + ' stderr=' + r.stderr);
  assert.ok(r.stdout.includes('FROZEN_OK'));
});

test('--check 红向：冻结件被改动 → exit 1 并列出差异（双向验证）', () => {
  const manifest = join(BENCH, 'manifest.json');
  const backup = mkdtempSync(join(ROOT, '.tmp-bench-'));
  const bak = join(backup, 'manifest.json');
  copyFileSync(manifest, bak);
  try {
    writeFileSync(manifest, readFileSync(manifest, 'utf8') + '\n', 'utf8'); // 追加换行 = 位级改动
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen_bench.js'), '--check'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('CHECK_FAIL'));
    assert.ok(r.stderr.includes('manifest.json'));
  } finally {
    copyFileSync(bak, manifest);
    rmSync(backup, { recursive: true, force: true });
  }
  const r2 = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen_bench.js'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r2.status, 0, '恢复后必须复绿');
});

test('真值库无 observed 类字段（05 §三 自证空转防线）', () => {
  for (const f of listFiles('cases')) {
    const obj = JSON.parse(readFileSync(join(BENCH, 'cases', f), 'utf8'));
    const text = JSON.stringify(obj);
    // 键名级扫描（子串会误伤 counterfactual 一类合法键名）：禁 observed/actual 一类观测语义键
    const keys = new Set();
    const collect = (o) => {
      for (const [k, v] of Object.entries(o)) {
        keys.add(k);
        if (v && typeof v === 'object') collect(v);
      }
    };
    collect(obj);
    const bannedRe = /(^|_)(observed|actual|got|produced|output|result_)(_|$)/i;
    for (const k of keys) assert.ok(!bannedRe.test(k), f + ' 含禁用观测语义键：' + k);
  }
});

test('期望键结构守门：键名自带结论、取值恒 true', () => {
  const verdictIds = new Set(['V.main', 'V.fallback']);
  for (const f of listFiles('cases')) {
    const { suite, cases } = JSON.parse(readFileSync(join(BENCH, 'cases', f), 'utf8'));
    assert.equal(suite, f.replace('.cases.json', ''));
    for (const c of cases) {
      assert.ok(c.case_id && c.kind && c.input && c.expect, f + ' 案例缺顶层键');
      for (const [k, v] of Object.entries(c.expect)) {
        assert.equal(v, true, f + '/' + c.case_id + ' 期望取值非 true：' + k);
        const ok = /^(verdict:V\.(main|fallback)|node:n\d+|edge:n\d+:(yes|no)|delta:edge:n\d+:(yes|no)|counterfactual:vs:.+|boundary:n\d+:field:[A-Za-z_][A-Za-z0-9_]*:T:-?\d+(\.\d+)?)$/.test(k);
        assert.ok(ok, f + '/' + c.case_id + ' 期望键不合规：' + k);
      }
      assert.ok(c.kind === 'base' || c.kind === 'alt' || c.kind === 'boundary', '未知案例类型 ' + c.kind);
    }
  }
});

test('全部冻结规则集通过 schema v1 校验；manifest 总数对账', () => {
  const ruleFiles = listFiles('rulesets');
  assert.equal(ruleFiles.length, 12, '规则包总数应为 12（4 场景 × 3 档）');
  for (const f of ruleFiles) {
    const rs = JSON.parse(readFileSync(join(BENCH, 'rulesets', f), 'utf8'));
    const vr = validateRuleset(rs);
    assert.deepEqual(vr.errors, [], f + ' 校验未通过');
  }
  const manifest = JSON.parse(readFileSync(join(BENCH, 'manifest.json'), 'utf8'));
  assert.equal(manifest.totals.ruleset_packs, ruleFiles.length);
  const caseTotal = listFiles('cases').reduce((n, f) => n + JSON.parse(readFileSync(join(BENCH, 'cases', f), 'utf8')).cases.length, 0);
  assert.equal(manifest.totals.cases_total, caseTotal);
  assert.equal(manifest.packs.length, ruleFiles.length);
});

test('冻结案例期望与引擎求值全量对账（真值 = 构造即真值）', () => {
  let checked = 0;
  for (const f of listFiles('rulesets')) {
    const rs = JSON.parse(readFileSync(join(BENCH, 'rulesets', f), 'utf8'));
    const cf = JSON.parse(readFileSync(join(BENCH, 'cases', f.replace('.rules.json', '.cases.json').replace('bench-', '')), 'utf8'));
    for (const c of cf.cases) {
      const t = traceRuleset(rs, c.input);
      checked++;
      for (const k of Object.keys(c.expect)) {
        if (k.startsWith('verdict:')) { assert.equal(k, 'verdict:' + t.verdict.id, f + '/' + c.case_id); continue; }
        if (k.startsWith('node:')) { assert.ok(t.nodePath.includes(k.slice(5)), f + '/' + c.case_id + ' ' + k); continue; }
        if (k.startsWith('edge:')) {
          const p = k.split(':');
          assert.ok(t.edges.some((e) => e.from === p[1] && e.branch === p[2]), f + '/' + c.case_id + ' ' + k);
          continue;
        }
        // delta/counterfactual/boundary 在成对对账与结构测试中核验
      }
    }
    // 反事实对：Δ 边集合等式（双向包含，04 §5）
    const base = cf.cases.find((c) => c.kind === 'base');
    const alt = cf.cases.find((c) => c.kind === 'alt');
    const tb = traceRuleset(rs, base.input);
    const ta = traceRuleset(rs, alt.input);
    const eb = new Set(tb.edges.map((e) => e.from + ':' + e.branch));
    const ea = new Set(ta.edges.map((e) => e.from + ':' + e.branch));
    const delta = new Set([...eb].filter((x) => !ea.has(x)).concat([...ea].filter((x) => !eb.has(x))));
    const claimed = Object.keys(alt.expect).filter((k) => k.startsWith('delta:edge:')).map((k) => k.slice(11));
    assert.equal(delta.size, claimed.length, f + ' Δ 集合基数不等');
    for (const d of delta) assert.ok(claimed.includes(d), f + ' Δ 边未被期望覆盖：' + d);
    // 边界对：lo 走 n1.no、hi 走 n1.yes（真跨已知临界点 T）
    for (const [loTag, hiTag] of [['lo1', 'hi1'], ['lo05', 'hi05']]) {
      const lo = cf.cases.find((c) => c.case_id.endsWith('-' + loTag));
      const hi = cf.cases.find((c) => c.case_id.endsWith('-' + hiTag));
      assert.ok(traceRuleset(rs, lo.input).edges.some((e) => e.from === 'n1' && e.branch === 'no'), f + ' ' + loTag + ' 未走 n1.no');
      assert.ok(traceRuleset(rs, hi.input).edges.some((e) => e.from === 'n1' && e.branch === 'yes'), f + ' ' + hiTag + ' 未走 n1.yes');
    }
  }
  assert.equal(checked, 72, '案例总数应为 72（12 包 × 6 案例）');
});

test('真值条目登记：manifest 记录四类植入真值且逐包齐备', () => {
  const manifest = JSON.parse(readFileSync(join(BENCH, 'manifest.json'), 'utf8'));
  const te = manifest.totals.truth_entries;
  assert.equal(te.thresholds, 52);
  assert.equal(te.unreachable_branches, 12);
  assert.equal(te.tautology_branches, 12);
  assert.equal(te.counterfactual_pairs, 12);
  for (const p of manifest.packs) {
    assert.ok(p.truth_types.thresholds >= 2, p.ruleset + ' 阈值真值不足');
    assert.equal(p.truth_types.unreachable_branches, 1);
    assert.equal(p.truth_types.tautology_branches, 1);
    assert.equal(p.truth_types.counterfactual_pairs, 1);
  }
});
