# HANDOFF-M4（→ M4 校验与基准完成）

> **用法**：新对话以 `/goal 读取 "<项目绝对路径>\plan\HANDOFF-M4.md" 继续完成任务` 启动（绝对路径只出现在用户侧启动命令，本文件内一律相对路径）。
> **项目根**：仓库根（本文件所在 `plan/` 的上一级）。

---

## 一、当前进度 + 证据（M0 + M1 + M2 + M3 已完成，2026-10-15）

**M0 = 计划先行 + 可运行骨架；M1 = 数据先行；M2 = 确定性内核；M3 = 渲染完成，全部完成**（M0–M2 详见 HANDOFF-M1/M2/M3 归档）。M3 交付实测：

| 项 | 证据 |
|---|---|
| 布局 tidy 精化 | `src/layout.js`：**裁定叶按引用实例化**（首实例沿用裁定 id、后续 `id#k`）——共享裁定不再挤单一坐标产生长回边（v0 不平衡观感的根源，tidy 核心修正）；`layoutGraph` 增产 `edgeTarget`（'from:branch' → 目标实例键）+ `leafSequence`（中序叶序，叶子 x 沿之严格递增）；内部节点 x = 两子实例中点（K-6 放宽口径"居中于子范围"的实现形态）；样例 + benchmark 12 包共 13 包逐包实测：双跑全等 / 边目标可解析 / 叶序递增 / 父=子中点 / 同深度无重叠（≥2R） |
| 渲染交互三件套 | `src/render.js`：① 走通高亮（v0 既有，端点改走 edgeTarget）；② **反事实 Δ 高亮**：值有变化 → `traceRulesetAny` 重算 → `diffPaths` vs 基准 → `assertHighlightSet` 集合等式断言（渲染层直接消费，违反走 `#page-error` 错误条）→ onlyA∪onlyB 红色虚线 + 分叉节点红染 + 横幅分叉信息；③ **阈值面板**：`bisectAll` 证据对**构建期预计算**进 `atlas-bisect` 内嵌 JSON（运行时零算法），ok/skip/no_boundary/too_many 如实展示，点击行定位字段 |
| 产物契约（不破 + 扩展） | 内嵌**四**份 JSON（atlas-graph / atlas-ruleset / atlas-baseline / **atlas-bisect**，全部 `<` → `\u003c`）+ 无时间戳 + 零外链（w3.org 白名单）+ 双渲染 sha256 一致；bundle 清单 = `['engine.js', 'counterfactual.js']`（bundle.js 本体未动）；list 模式运行时分派 `traceListRuleset`（mode 键读自 atlas-ruleset） |
| 交互层零判定逻辑 | m3.test B2 静态扫描：交互层无字段比较表达式 / 裁定 id / 粗扫参数 / 二分循环——只做"取值 → 调引擎 → 映射展示" |
| headless 冒烟 | Edge `--headless --screenshot` 双截图入仓：`docs/demo/demo-game-headless.png`（基准：路径 4 边蓝高亮 + V.playoff 绿框 + 阈值面板 2 证据对）+ `docs/demo/demo-game-counterfactual.png`（Δ 5 边红色虚线 + 分叉节点 n1 红染）；DOM 探针实测：page-error 未触发 / 面板渲染正确 / `DIVEDGE=5` 与引擎 Δ 口径一致 |
| 测试全绿 | `npm test`（逐文件，m3.test.js 已追加 package.json）→ **67 pass / 0 fail**（M2 的 61 + m3.test 6）；`npm run selftest` → SELFTEST_OK；`node tools/gen_bench.js --check` → FROZEN_OK（25 文件，冻结件未动） |
| 台账回写 | plan/00（台账 3 项 ✅ M3、决策记录 +2 条：M3 布局 tidy 口径 / M3 骨架实测、里程碑 M3 ✅）、plan/06（M3 完成实测 6 条） |

## 二、下一棒待办（M4 校验与基准完成）

按 `plan/06-里程碑详表.md` M4 节 + `plan/04-模块详设.md` §7/§8/§10 执行：

1. **覆盖率自检 `src/coverage.js`**（§7）：沿树抽象解释——number 字段维护区间约束（含端点开闭），boolean/enum/string 维护可能值集合；逐边求交；**复合条件否定分支不细化 → 标 unknown**（三值逻辑 `{可行, 不可行, 未知}`，宁可少报不假报）；报告三类：`unreachable_branch` / `contradiction` / `tautology`；输出 JSON + 文本双轨；
2. **覆盖率对账**（M2 预埋素材）：与 benchmark 植入真值对账出 precision/recall——**prefix_implied 28 条**（nB 链结构性恒真）是 tautology 检出的对账分母；约束影子不可达 12 条是 unreachable_branch 的对账分母；对不上的如实报 unknown，不折算；
3. **校验器 `tools/validate.js`**（§8）：① 规则集/案例复用 `src/schema.js`；② 产物校验：抽取 `atlas-graph` 标记 → 断言 §3 不变量 1–4（节点数=规则数 / 每边可归因极性 / 无孤儿 / 叶子终止）+ 坐标有限 + 无外链；③ `--check` 模式：按规则集重渲染与给定产物**逐字节比对**（sha256）——防产物与规则集脱钩；退出码 0/1/2 三语义（K-1）；
4. **基准评测 `tools/bench.js`**（§10）：一条命令出指标表（路径准确率 / 裁定准确率 / 临界点命中率 / 不可达检出 precision-recall / 反事实 Δ 对账），门槛随 `data/benchmark/manifest.json`；`--only <suite>` 白名单，未知名 → exit 2；达标值末态回填 README；
5. **探活必红**（每套件逐个验证）：篡改期望 / 坏引用规则集 / 边界挪动 ε 外 / 不可达注入（期望不可达但实际可达）→ 基准必须报未达标；
6. **收尾**：`npm test` 全绿（新测试文件同步 package.json，K-10）→ plan/00/06 回写 → `plan/HANDOFF-M5.md`（六节）→ commit。

**M4 明确不做**：SKILL.md/报告/README 正式版/演示素材（M5）、发布（M6）；render/layout 不再动（M3 已冻结口径，动了 67 项测试会打挂）。

## 三、既定口径清单（K 编号，动了会打挂测试）

| # | 口径 | 位置 |
|---|---|---|
| K-1 | 退出码三语义：0 成功 / 1 内容校验失败 / 2 用法或输入形态不可用（YAML 越界算 2） | 04/07 D-07；`tools/atlas.js` |
| K-2 | canonical JSON：键按码点排序、无空白、非有限数与 undefined 抛错；graph 仅在 `default_verdict` 存在时携带该键 | `src/canonical.js`、`src/graph.js` |
| K-3 | 树模式为主；list 模式 = 编译通道（首命中语义）；`$default` 求值期解析（F-4）；case 必须完备 | 04 §1/§3、D-04/D-06 |
| K-4 | 确定性禁令：`src/`、`tools/` 禁 `Date.now`/`new Date(`/`Math.random(`（注释行豁免）；生成器 splitmix64 | 03 G4、D-08；`tests/hygiene.test.js` |
| K-5 | 产物契约：内嵌四份 JSON（graph/ruleset/baseline/**bisect**，M3 起）；bundle 顶层拼接不包 IIFE；零外链白名单仅 w3.org | `src/render.js`、04 §9、D-11 |
| K-6 | 坐标唯一产出点：`src/layout.js`；**M3 冻结形态**：裁定叶按引用实例化（id / id#k）+ `edgeTarget` + `leafSequence`；叶子 x 沿叶序严格递增；父=两子实例中点；双跑全等 | 04 §4、D-10；`src/layout.js`；m3.test A1/A2 |
| K-7 | 零规则字面量门禁：literalscan 派生 token + m2.test E1/E2/E3；扫描面=engine/schema/graph/counterfactual/bisect/yaml（含注释）；**新增 src 模块若承载判定语义（如 coverage.js）须加入扫描面** | 03 G3；`tests/m2.test.js` |
| K-8 | LF 纪律：`.gitattributes` + hygiene CR 守门（本机 `core.autocrlf=true`） | 03 G6 |
| K-9 | CI 类 DoD 措辞：未接远端一律写"本地等价校验（CI 待首推验证）" | 06 收尾纪律 |
| K-10 | `npm test` 逐文件列出（新增测试文件必须同步加进 package.json scripts.test） | package.json；04 §1.8 F-2 |
| K-11 | trace.edges 含终端边（F-5）；nodePath 只含条件节点（list 模式=已求值规则序列）；list 全 miss 时末条规则 no 边也是终端边 | 04 §2/§1.8；`src/engine.js` |
| K-12 | benchmark 冻结件禁手改：25 文件由 gen_bench.js 生成；`--check` 必须保持 FROZEN_OK | 05 §三/§四；`tests/genbench.test.js` |
| K-13 | gen_bench.js 被 import 不得执行 CLI（入口守卫） | `tools/gen_bench.js` |
| K-14 | 阈值对账三类口径：裁定级 12 / path 级 12 / prefix_implied 28（52 条真值）；bisect 证据对只对裁定级断言；compileListToTree 产物剥 mode/rules 键 | `tests/m2.test.js` C3/A3；plan/00 决策记录 |
| K-15 | YAML 子集清单冻结在 `src/yaml.js` 头注；越界 = E_YAML_* → CLI exit 2；YAML 解析只管语法形态，语义校验归 schema.js | `src/yaml.js`；D-03 |
| K-16 | **M3 布局/渲染冻结口径**：布局产出 `edgeTarget`/`leafSequence`；渲染内嵌四份 JSON；bundle 清单 = engine+counterfactual；阈值证据对构建期预计算（运行时零算法）；交互层零判定逻辑（m3.test B2 静态扫描） | `src/layout.js`、`src/render.js`；`tests/m3.test.js` |
| K-17 | **覆盖率诚实口径**（§7 预埋）：复合条件否定分支不细化 → unknown 显式列出；对账不上的如实报 unknown 不折算命中——M4 coverage 实现直接沿用（与 K-14 同源的诚实纪律） | 04 §7；plan/00 决策记录 |

## 四、本机环境坑（全部实测）

1. **`node --test tests/`（目录参数）在 Git Bash + Node v24 下 MODULE_NOT_FOUND** → 逐文件列出（package.json 已配置至 m3.test.js，新增文件记得再追加）。
2. **本机 `core.autocrlf=true`**：新文件靠 Write 工具 LF + `.gitattributes` 兜底；hygiene 扫全仓 CR。
3. **Edge 路径**：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（x86 目录）；headless 截图先删旧 PNG、`--screenshot="D:\\…"` 双反斜杠、启动后 `sleep 1~2` 再断言；`--virtual-time-budget=3000` 可驱动 setTimeout 后再 dump-dom/截图。
4. **临时脚本**：放 `.tmp/`（已 gitignore，用完删）并落 `.mjs` 文件；`cat > file <<'EOF'` 前确保 `.tmp` 目录存在（`mkdir -p .tmp`）。
5. **无 Python 依赖**（纯 JS 项目）。
6. **genbench 守门测试含红向用例**：失败输出见 `CHECK_FAIL` 先查恢复逻辑是否漏了 finally。
7. **layout/渲染已冻结（K-16）**：M4 别动 `src/layout.js`/`src/render.js`（67 项测试锁定）；validate.js 重渲染比对直接调 `renderHtml(buildGraph(rs), case, rs)`。
8. **覆盖率对账数据源**：真值键形态见 `data/benchmark/manifest.json` + 各 cases 文件 `expect` 键（`delta:edge:*` / 阈值 / 不可达 / 恒真四定式）；m2.test C3 的三类归类逻辑可复用为对账参考实现。

## 五、DoD 逐项 checklist（M4，来自 plan/06）

- [ ] 校验器 `--check`：重渲染与产物逐字节比对（sha256）通过；
- [ ] 覆盖率 precision/recall 与植入集合对账（有分母有分子；unknown 如实列出）；
- [ ] 基准指标达标（门槛随 manifest；达标值末态回填 README）；
- [ ] 探活：每套件注入缺陷 → 必报未达标（逐个验证）；
- [ ] `npm test` 全绿（新增测试文件同步 package.json）+ 退出码三语义锁测试；
- [ ] plan/00/06 回写 + `plan/HANDOFF-M5.md` 落盘并 commit。

## 六、关键命令速查

```bash
# 测试（逐文件；新增 tests/*.test.js 后同步追加到 package.json）
npm test

# 自检 / 构建 / 求值 trace
npm run selftest
node tools/atlas.js build data/samples/demo-game.rules.json --case data/samples/demo-game.case.json -o out/demo-game.html
node tools/atlas.js walk data/samples/demo-game.rules.json --case data/samples/demo-game.case.json

# M2/M3 命令
node tools/atlas.js bisect data/samples/demo-game.rules.json --case data/samples/demo-game.case.json
node tools/atlas.js counterfactual data/samples/demo-game.rules.json --case data/samples/demo-game.case.json --case-b <alt.json>
# YAML 输入：把 .rules.json 换成 .yml 即走 YAML 子集解析；越界 → E_YAML_* + exit 2

# 基准冻结件（禁手改；改生成器后重生成）
node tools/gen_bench.js            # 重新生成 25 文件
node tools/gen_bench.js --check    # 位级守门：FROZEN_OK / CHECK_FAIL

# headless 冒烟（Edge 在 x86 目录；先删旧截图）
rm -f out/demo-shot.png
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless --disable-gpu \
  --window-size=1400,1000 --screenshot="D:\\…\\out\\demo-shot.png" "file:///…/out/demo-game.html"

# git（本仓库无远端；M6 才建仓首推）
git status && git log --oneline | head -5
```

**续接提示词模板**：`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M4.md" 继续完成 M4 校验与基准完成`
