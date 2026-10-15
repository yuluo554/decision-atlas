# HANDOFF-M1（→ M1 数据先行）

> **用法**：新对话以 `/goal 读取 "<项目绝对路径>\plan\HANDOFF-M1.md" 继续完成任务` 启动（绝对路径只出现在用户侧启动命令，本文件内一律相对路径）。
> **项目根**：仓库根（本文件所在 `plan/` 的上一级）。

---

## 一、当前进度 + 证据（M0 已完成，2026-10-15）

**M0 = 计划先行 + 可运行骨架，全部完成**：

| 项 | 证据 |
|---|---|
| plan/02–07 六份计划文档落盘 | `plan/02-需求解读.md`（FR-01–15 / 边界 / 可证伪承诺 C1–C8）、`03-架构与技术选型`（D-01–D-12 雏形 / G1–G6 纪律）、`04-模块详设`（schema v1 规格 + 各模块契约）、`05-数据计划`（生成器设计 + 真值库格式）、`06-里程碑详表`（M0–M6 DoD）、`07-交付对标`（评分映射 + 待定决策表 Q1–Q6） |
| 骨架代码（零第三方依赖） | `src/`：canonical / schema / engine / graph / layout / render / bundle 七模块 v0；`tools/atlas.js`（selftest / build / walk） |
| 测试全绿 | `node --test tests/schema.test.js tests/engine.test.js tests/render.test.js tests/hygiene.test.js` → **32 pass / 0 fail**（node:test 内置 runner） |
| selftest 通过 | `npm run selftest` → `SELFTEST_OK` + engine/html sha256（双跑确定性 + 无外链 + 无时间戳内置自检） |
| 双次构建字节一致 | `build` 两次 → `out/demo-game.html` sha256 相同（实测 `4f26a1d5…`） |
| headless 冒烟 | Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`）`--headless --screenshot` file:// 打开产物：初始裁定"进入晋级赛（V.playoff · refer）"正确、走通路径高亮（截图存 `out/demo-shot.png`，产物不入仓） |
| 退出码三语义实测 | 未知命令=2 / 规则集校验失败=1 / 缺文件=2 / selftest=0 |
| plan/00·05·06 状态回写 | 00 索引/决策记录/里程碑表已更新；data/README 增补"当前数据资产"节（demo-game 样例登记） |
| CI 预置 | `.github/workflows/ci.yml`（ubuntu/windows × node 22/24 四矩阵，无远端未跑——**本地等价校验**即上表各项，CI 待首推验证） |

**尚未开始（M1+）**：schema v1 冻结稿、`data/benchmark/` 合成数据、`tools/gen_bench.js`、YAML 子集、list 模式、反事实/阈值二分、覆盖率、validate.js、bench.js、SKILL.md、报告、发布。

## 二、下一棒待办（M1 数据先行）

按 `plan/06-里程碑详表.md` M1 节 + `plan/05-数据计划.md` 执行：

1. **schema v1 冻结**：以 `plan/04-模块详设.md` §1 为基础实测勘误（骨架 v0 已实跑，发现的问题集中在这一步修）；勘误处逐条同步 04 + 决策记录；`data/samples/demo-game.*` 若需迁移一并做并登记台账；
2. **`tools/gen_bench.js` 生成器**：splitmix64 自研 RNG（禁 `Math.random`/时钟，见 K-4）；四个白名单场景（SYN-ENROLL/REIMB/CREDIT/GAME）参数化模板；植入真值（已知路径/临界点/不可达/反事实对，构造法见 05 §2.2）；`--check` 位级守门；
3. **`data/benchmark/` 冻结落盘**：`rulesets/bench-*.rules.json` + `cases/*.cases.json`（**只存 input + expect**，禁 observed 字段）+ `manifest.json`（门槛骨架 + 总数/采样数登记）；
4. **测试**：生成器双跑逐字节一致、`--check` 红绿双向、真值库无 observed 字段守门；
5. **台账回写**：data/README（白名单定稿 + 总量/采样数）、plan/00/05/06 状态；
6. **收尾**：写 `plan/HANDOFF-M2.md` → commit。

**M1 明确不做**：YAML 解析（M2）、list 模式（M2）、反事实/二分实现（M2）、渲染改动（M3）。

## 三、既定口径清单（K 编号，动了会打挂测试）

| # | 口径 | 位置 |
|---|---|---|
| K-1 | **退出码三语义**：0 成功 / 1 内容校验失败 / 2 用法或输入形态不可用；未知命令=2 锁进 CI 冒烟 | 04/07 D-07；`tools/atlas.js` |
| K-2 | **canonical JSON**：键按码点排序、无空白、非有限数与 undefined 一律抛错（graph.buildGraph 据此只在 `default_verdict` 存在时携带该键） | `src/canonical.js`、`src/graph.js` |
| K-3 | **树模式为主**（显式 nodes + branches yes/no），list 模式 M2 编译通道；`$default` 哨兵 + `default_verdict`；case 必须完备（缺字段=错误不猜） | 04 §1/§3、D-04/D-06 |
| K-4 | **确定性禁令**：`src/`、`tools/` 禁 `Date.now`/`new Date(`/`Math.random(`（tests/hygiene.test.js 逐行扫描，注释行豁免）；生成器 M1 用 splitmix64 | 03 G4、D-08 |
| K-5 | **产物契约**：内嵌三份 JSON（`atlas-graph`=编译图 / `atlas-ruleset`=**原始规则集**（运行时引擎吃它，不是 graph！）/ `atlas-baseline`=基准案例）；bundle 顶层拼接不包 IIFE（运行时按名调 `traceRuleset`）；零外链白名单仅 `http://www.w3.org/` | `src/render.js`、04 §9、D-11 |
| K-6 | **坐标唯一产出点**：布局只发生在 `src/layout.js`（v0 中序定叶+中点回填；不变量：父 x=(yes.x+no.x)/2、叶子 x 严格递增、双跑全等）；渲染只消费 | 04 §4、D-10 |
| K-7 | **零规则字面量**：engine 源码不得含样例规则集 token（hygiene 测试已有雏形）；M2 建正式门禁（从规则集派生禁用 token + selftest 阳性对照） | 03 G3 |
| K-8 | **LF 纪律**：`.gitattributes`（`* text=auto eol=lf`）+ hygiene CR 守门（本机 `core.autocrlf=true`，全靠它兜底） | 03 G6 |
| K-9 | **CI 类 DoD 措辞**：未接远端一律写"本地等价校验（CI 待首推验证）"，不写"CI 绿" | 06 收尾纪律 |
| K-10 | **测试运行方式**：`node --test tests/schema.test.js tests/engine.test.js …` 逐文件列出（`node --test tests/` 目录形式在本机报 MODULE_NOT_FOUND）；`npm test` 同理需展开 | 本机环境坑（下节） |

## 四、本机环境坑（全部实测）

1. **`node --test tests/`（目录参数）在 Git Bash + Node v24 下报 `Cannot find module ...\tests`** → 必须逐文件列出或用 glob `"tests/*.test.js"`；package.json `npm test` 已按逐文件方式配置。
2. **本机 `core.autocrlf=true`**：Write 工具新建文件为 LF，但 checkout/未来协作依赖 `.gitattributes` 兜底（已建）；hygiene 测试扫全仓 CR。
3. **Edge 路径**：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（x86 目录，不是 Program Files）；headless 截图必须先删旧 PNG 再截（同名旧文件会造成"已更新"假象）；启动后 `sleep 1~2` 再断言文件存在。
4. **Git Bash 反斜杠路径**：`--screenshot="D:\\…"` 双反斜杠；正斜杠文件参数（`/tmp/...`）会触发 MSYS 路径改写——临时文件放工作区相对路径。
5. **Node ESM**：本项目 `"type": "module"`；`node -e` 里的 `import()` 动态导入在 CommonJS eval 上下文中行为不一致，诊断脚本用 `--input-type=module -e` 或落 `.mjs` 文件（`.tmp/` 已 gitignore，用完删）。
6. **无 Python 依赖**（纯 JS 项目，绕开 py/编码问题族）；`py -0p` 显示 3.8.8 与 3.12 双通道，如未来需要脚本辅助优先 3.12。

## 五、DoD 逐项 checklist（M1，来自 plan/06）

- [ ] schema v1 冻结：04 §1 勘误同步（骨架猜测被实测修正处逐条留档）+ 样例迁移登记
- [ ] `data/benchmark/` 四白名单场景规则集 + 案例 + 真值 + manifest 入仓
- [ ] `tools/gen_bench.js`：双跑逐字节一致；`--check` 一致→0、改动→1（**双向验证过**）
- [ ] 真值库无 `observed` 类字段（守门测试）
- [ ] 台账回写（白名单定稿、总量/采样数登记、来源=合成无外部依赖）
- [ ] `npm test` 全绿（本地等价校验，未接远端，CI 待首推验证）
- [ ] `plan/HANDOFF-M2.md` 本对话内落盘并 commit
- [ ] plan/00·05·06 状态回写 ✅

## 六、关键命令速查

```bash
# 测试（逐文件列出；node --test tests/ 目录形式在本机会挂）
node --test tests/schema.test.js tests/engine.test.js tests/render.test.js tests/hygiene.test.js

# 自检 / 构建 / 求值 trace
npm run selftest
node tools/atlas.js build data/samples/demo-game.rules.json --case data/samples/demo-game.case.json -o out/demo-game.html
node tools/atlas.js walk data/samples/demo-game.rules.json --case data/samples/demo-game.case.json

# headless 冒烟（Edge 在 x86 目录；先删旧截图）
rm -f out/demo-shot.png
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless --disable-gpu \
  --window-size=1400,1000 --screenshot="D:\\…\\out\\demo-shot.png" "file:///…/out/demo-game.html"

# git（本仓库无远端；M6 才建仓首推）
git status && git log --oneline | head -5
```

**续接提示词模板**：`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M1.md" 继续完成 M1 数据先行`
