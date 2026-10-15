# HANDOFF-M5（→ M5 交付：SKILL.md + 报告 + README 正式版 + 演示素材）

> **用法**：新对话以 `/goal 读取 "<项目绝对路径>\plan\HANDOFF-M5.md" 继续完成任务` 启动（绝对路径只出现在用户侧启动命令，本文件内一律相对路径）。
> **项目根**：仓库根（本文件所在 `plan/` 的上一级）。

---

## 一、当前进度 + 证据（M0–M4 已完成，2026-10-15）

**M0 = 计划先行 + 骨架；M1 = 数据先行；M2 = 确定性内核；M3 = 渲染完成；M4 = 校验与基准完成**（M0–M3 详见 HANDOFF-M1/M2/M3/M4 归档）。M4 交付实测：

| 项 | 证据 |
|---|---|
| 覆盖率自检 `src/coverage.js` | 沿树抽象解释（number 区间含端点开闭 / boolean/enum 值集）；三值逻辑：复合否定分支与数域 `==`/`!=` 挖点不细化 → **unknown 显式列出**（K-17）；报告四类 unreachable_branch / contradiction / tautology / unknown + JSON/文本双轨（`analyze` / `reportText` / `findingKeys`）；list 模式经 `compileListToTree` 直通；纯函数双跑一致；K-7 扫描面候选（本模块不含规则字面量，m4.test 未将其加入扫描面——若后续承载更多判定语义可按 K-7 追加） |
| 覆盖率对账 | unreachable 植入 12 条（n7 约束影子）**precision/recall 全 1.000**；恒真 recall 1.000（n5 prefix_implied 12 条）；nB*/n6 结构性恒真额外检出**如实登记不折算**（precision 0.25~0.071 展示）；分母锚定 manifest（12 包 / unreachable_branches=12 / tautology_branches=12） |
| 校验器 `tools/validate.js` | 产物自检（四内嵌标记抽取 → §3 不变量 1–4 + SVG 坐标有限 + 零外链 + 无时间戳）+ `--check` 重渲染 sha256 逐字节比对（防产物与规则集脱钩）；退出码 0/1/2（K-1）锁进 m4.test C3；可独立调用的纯函数：`extractEmbeddedJson` / `checkGraphInvariants` / `checkSvgCoordsFinite` / `checkNoExternalLinks` |
| 基准评测 `tools/bench.js` | 一条命令指标表（路径 1.000 / 裁定 1.000 / 临界点 52 条三类复核 / 反事实 Δ 12/12 集合等式 / 不可达 P/R 1.000）；`--only <suite>` 白名单（未知名 exit 2）；`--probe <kind> <suite>` 探活；`--json -o <file>` 输出 JSON 报告；**数据源锚定**：先比对生成器真值与冻结件位级一致（K-12 运行时复验）再对账 |
| 探活必红 | 四缺陷（expect 篡改期望 / ref 坏引用 / boundary 边界挪动 ε 外 / unreachable 不可达注入）× 12 套件 = **48 组全部 exit 1**（逐套件实测；m4.test D3 锁定） |
| 门槛随 manifest | `manifest.thresholds` 节 M4 回填（全下限 1.0；恒真不设 precision 门槛——nB*/n6 结构性恒真额外检出如实登记）；改的是 `tools/gen_bench.js` 生成器 + 重生成，`gen_bench --check` 保持 **FROZEN_OK**（25 文件）；基准指标表末态回填 README |
| 测试全绿 | `npm test` → **83 pass / 0 fail**（M3 的 67 + m4.test 16，K-10 已同步 package.json）；selftest SELFTEST_OK |
| 台账回写 | plan/00（决策记录 +3 条：K-17 落地 / 对账口径 / 门槛下发；承诺表 3 项 ✅ M4；里程碑表 M4 ✅）、plan/06（M4 节标题 ✅ + 完成实测 6 条） |

## 二、下一棒待办（M5 交付：SKILL.md + 报告 + README 正式版 + 演示素材）

按 `plan/06-里程碑详表.md` M5 节 + `plan/04-模块详设.md` §11 执行：

1. **SKILL.md**（主入口，§11 大纲）：何时使用（触发词）/ 输入契约（schema 摘要 + 错误码表）/ 命令（build / walk / validate / bench，含 M4 新工具）/ 边界（不发明规则、不产坐标、纯本地）/ 自定义指引（文案/配色可调，坐标与裁定不可改）；
2. **README 正式版**：快速开始 / 指标表（M4 已回填，复核即可）/ 限制节 / GIF；逐条命令在干净目录一次跑通并留档（退出码符合明示语义）；
3. **`docs/report.md` 技术报告**（§11 大纲）：求值语义方法 / 确定性布局 / 反事实路径差与阈值二分的可证伪设计 / 覆盖率三值逻辑与诚实口径 / 基准结果（末态：12 套件全达标 + 探活 48 组必红）/ 边界与扩展；**不含无法复现的断言**；
4. **`docs/demo/` 演示素材**：截图 + GIF，程序化产出、可复现（两次生成 sha256 逐个一致）；M3 已有 headless 双截图（demo-game-headless.png / demo-game-counterfactual.png），M5 增补 validate/bench 报告截图与 GIF；
5. **SKILL.md 演练**：另一会话按说明书完成全流程（DoD 2）；素材可复现（DoD 3）；
6. **收尾**：`npm test` 全绿 → plan/00/06 回写 → `plan/HANDOFF-M6.md`（六节）→ commit。

**M5 明确不做**：GitHub 发布（M6）；`src/`、`tools/` 功能代码不再动（M4 已冻结口径，83 项测试锁定）。

## 三、既定口径清单（K 编号，动了会打挂测试）

| # | 口径 | 位置 |
|---|---|---|
| K-1 | 退出码三语义：0 成功 / 1 内容校验失败 / 2 用法或输入形态不可用（YAML 越界算 2）——**M4 起四个工具（atlas/validate/bench/gen_bench --check）统一** | 04/07 D-07；`tools/atlas.js`、`tools/validate.js`、`tools/bench.js`；m4.test C3/D2/D4 |
| K-2 | canonical JSON：键按码点排序、无空白、非有限数与 undefined 抛错；graph 仅在 `default_verdict` 存在时携带该键 | `src/canonical.js`、`src/graph.js` |
| K-3 | 树模式为主；list 模式 = 编译通道（首命中语义）；`$default` 求值期解析（F-4）；case 必须完备 | 04 §1/§3、D-04/D-06 |
| K-4 | 确定性禁令：`src/`、`tools/` 禁 `Date.now`/`new Date(`/`Math.random(`（注释行豁免）；生成器 splitmix64；**coverage/validate/bench 已纳入 m4.test E1** | 03 G4、D-08；`tests/hygiene.test.js`、`tests/m4.test.js` |
| K-5 | 产物契约：内嵌四份 JSON（graph/ruleset/baseline/bisect）；bundle 顶层拼接不包 IIFE；零外链白名单仅 w3.org | `src/render.js`、04 §9、D-11 |
| K-6 | 坐标唯一产出点：`src/layout.js`；M3 冻结形态：裁定叶按引用实例化（id / id#k）+ `edgeTarget` + `leafSequence` | 04 §4、D-10；`src/layout.js`；m3.test A1/A2 |
| K-7 | 零规则字面量门禁：literalscan 派生 token + m2.test E1/E2/E3；扫描面 = engine/schema/graph/counterfactual/bisect/yaml（coverage.js 未加入——其逻辑为通用抽象解释，无规则字面量；若后续改动引入语义特化须按 K-7 追加扫描） | 03 G3；`tests/m2.test.js` |
| K-8 | LF 纪律：`.gitattributes` + hygiene CR 守门（本机 `core.autocrlf=true`） | 03 G6 |
| K-9 | CI 类 DoD 措辞：未接远端一律写"本地等价校验（CI 待首推验证）" | 06 收尾纪律 |
| K-10 | `npm test` 逐文件列出（新增测试文件必须同步加进 package.json scripts.test） | package.json；04 §1.8 F-2 |
| K-11 | trace.edges 含终端边（F-5）；nodePath 只含条件节点；list 全 miss 时末条规则 no 边也是终端边 | 04 §2/§1.8；`src/engine.js` |
| K-12 | benchmark 冻结件禁手改：25 文件由 gen_bench.js 生成；`--check` 必须保持 FROZEN_OK；**bench.js 装载数据时先锚定（生成器输出 == 磁盘位级）再对账** | 05 §三/§四；`tests/genbench.test.js`；`tools/bench.js` loadBenchmark |
| K-13 | gen_bench.js 被 import 不得执行 CLI（入口守卫 `isMain`）；validate.js / bench.js 同款守卫 | `tools/gen_bench.js`、`tools/validate.js`、`tools/bench.js` |
| K-14 | 阈值对账三类口径：裁定级 12 / path 级 12 / prefix_implied 28（52 条真值）；bisect 证据对只对裁定级断言；compileListToTree 产物剥 mode/rules 键 | `tests/m2.test.js` C3/A3；plan/00 决策记录 |
| K-15 | YAML 子集清单冻结在 `src/yaml.js` 头注；越界 = E_YAML_* → CLI exit 2；YAML 解析只管语法形态，语义校验归 schema.js | `src/yaml.js`；D-03 |
| K-16 | M3 布局/渲染冻结口径：布局产出 `edgeTarget`/`leafSequence`；渲染内嵌四份 JSON；bundle 清单 = engine+counterfactual；阈值证据对构建期预计算（运行时零算法）；交互层零判定逻辑（m3.test B2 静态扫描） | `src/layout.js`、`src/render.js`；`tests/m3.test.js` |
| K-17 | 覆盖率诚实口径：复合条件否定分支不细化 → unknown 显式列出；对账不上的如实报 unknown 不折算命中；**恒真检出门槛只锁 recall（nB*/n6 结构性额外检出如实登记，precision 不设门槛）** | 04 §7；`src/coverage.js`；`manifest.thresholds` |
| K-18 | **M4 校验/基准冻结口径**：validate 的 `--check` 需显式规则集参数（防对内嵌规则集自证）；bench 真值对账锚定冻结件（位级）；探活四缺陷 kind = expect/ref/boundary/unreachable；manifest.thresholds 是达标判据（数据非代码） | `tools/validate.js`、`tools/bench.js`、`tools/gen_bench.js`；`tests/m4.test.js` |

## 四、本机环境坑（全部实测）

1. **`node --test tests/`（目录参数）在 Git Bash + Node v24 下 MODULE_NOT_FOUND** → 逐文件列出（package.json 已配置至 m4.test.js，新增文件记得再追加）。
2. **本机 `core.autocrlf=true`**：新文件靠 Write 工具 LF + `.gitattributes` 兜底；hygiene 扫全仓 CR。
3. **Edge 路径**：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（x86 目录）；headless 截图先删旧 PNG、`--screenshot="D:\\…"` 双反斜杠、启动后 `sleep 1~2` 再断言；`--virtual-time-budget=3000` 可驱动 setTimeout 后再 dump-dom/截图。
4. **临时脚本**：放 `.tmp/`（已 gitignore，用完删）并落 `.mjs` 文件；`mkdir -p .tmp` 先行。
5. **无 Python 依赖**（纯 JS 项目）。
6. **genbench 守门测试含红向用例**：失败输出见 `CHECK_FAIL` 先查恢复逻辑是否漏了 finally。
7. **layout/渲染/校验基准已冻结（K-16/K-18）**：M5 别动 `src/layout.js`/`src/render.js`/`src/coverage.js`/`tools/validate.js`/`tools/bench.js`（83 项测试锁定）；演示素材截图直接 `node tools/atlas.js build …` + headless Edge；bench 报告截图可用 `node tools/bench.js` 终端输出或 `--json` 产物渲染。
8. **改 manifest 必须走生成器**：直接改 `data/benchmark/manifest.json` 会被 `gen_bench --check` 与 bench 锚定双重拦截（CHECK_FAIL / exit 2）；正确路径 = 改 `tools/gen_bench.js` → `node tools/gen_bench.js` 重生成 → `--check` 复验。
9. **m4.test D3 探活是 48 组 spawnSync**（约 5 秒）；全量 `npm test` 约 7–10 秒，勿因时长误判挂死。

## 五、DoD 逐项 checklist（M5，来自 plan/06）

- [ ] SKILL.md 落盘（触发词/输入契约/命令/边界/自定义指引，§11 大纲）；
- [ ] README 正式版（快速开始/指标表/限制节/GIF）+ 干净目录逐条命令一次跑通留档；
- [ ] `docs/report.md` 技术报告（与实现一致，无无法复现的断言）；
- [ ] 演示素材可复现（两次生成 sha256 逐个一致；validate/bench 演示面入素材）；
- [ ] SKILL.md 演练：另一会话按说明书完成全流程；
- [ ] `npm test` 全绿 + plan/00/06 回写 + `plan/HANDOFF-M6.md` 落盘并 commit。

## 六、关键命令速查

```bash
# 测试（逐文件；新增 tests/*.test.js 后同步追加到 package.json）
npm test

# 自检 / 构建 / 求值 / 校验 / 基准（M4 起）
npm run selftest
node tools/atlas.js build data/samples/demo-game.rules.json --case data/samples/demo-game.case.json -o out/demo-game.html
node tools/validate.js data/samples/demo-game.rules.json out/demo-game.html --check
node tools/bench.js                                # 12 套件指标表（exit 0 = 全达标）
node tools/bench.js --only syn-credit-001          # 白名单单套件
node tools/bench.js --probe boundary syn-credit-001   # 探活必红（exit 1）
node tools/bench.js --json -o out/bench-report.json   # JSON 报告
node tools/atlas.js walk data/samples/demo-game.rules.json --case data/samples/demo-game.case.json

# 基准冻结件（禁手改；改门槛/数据走生成器再重生成）
node tools/gen_bench.js            # 重新生成 25 文件
node tools/gen_bench.js --check    # 位级守门：FROZEN_OK / CHECK_FAIL

# headless 冒烟（Edge 在 x86 目录；先删旧截图）
rm -f out/demo-shot.png
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless --disable-gpu \
  --window-size=1400,1000 --screenshot="D:\\…\\out\\demo-shot.png" "file:///…/out/demo-game.html"

# git（本仓库无远端；M6 才建仓首推）
git status && git log --oneline | head -5
```

**续接提示词模板**：`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M5.md" 继续完成 M5 交付（SKILL.md + 报告 + README 正式版 + 演示素材）`
