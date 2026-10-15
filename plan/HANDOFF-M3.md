# HANDOFF-M3（→ M3 渲染完成）

> **用法**：新对话以 `/goal 读取 "<项目绝对路径>\plan\HANDOFF-M3.md" 继续完成任务` 启动（绝对路径只出现在用户侧启动命令，本文件内一律相对路径）。
> **项目根**：仓库根（本文件所在 `plan/` 的上一级）。

---

## 一、当前进度 + 证据（M0 + M1 + M2 已完成，2026-10-15）

**M0 = 计划先行 + 可运行骨架；M1 = 数据先行（详见 HANDOFF-M1/M2 归档）；M2 = 确定性内核，全部完成**：

| 项 | 证据 |
|---|---|
| 引擎全量（tree+list） | `src/engine.js`：`traceRuleset`（tree，M1 冻结口径）+ `traceListRuleset`（list：首命中生效 / 无命中 → default_verdict / nodePath=已求值规则序列 / **edges 含终端边**（F-5 同口径：miss→下一条规则、命中→{from,branch:"yes",to:裁定}、全 miss→末条 no 边进 default））+ `traceRulesetAny` 按 `rs.mode` 分派；list 双跑 sha256 相等（tests/m2.test.js A5） |
| schema list 校验 | `src/schema.js`：mode 分派 `validateListBody`（rules {id,when,then} 校验、then 悬空 E_REF、缺 default_verdict E_DEFAULT_MISSING、nodes/rules 互斥 E_MODE、rule id 与裁定冲突 E_ID_DUP）；tree 主体抽为 `validateTreeBody`（逻辑未动，M1 测试原样通过） |
| list→tree 编译 | `src/graph.js` `compileListToTree`（r1→{yes:verdict,no:r2}…rN→{yes:verdict,no:$default}；**剥掉 mode/rules 键**——否则过不了 tree 校验互斥）；`buildGraph` 自动走编译通道；等价性对账双向实测（m2.test A3 32 组输入采样 + A4 链式 tree→list），verdict/nodePath/edges 逐项一致 |
| 反事实路径差 | `src/counterfactual.js`：`diffPaths`（onlyA/onlyB/common/divergeIndex/divergeNode；边身份=from+branch）+ `assertHighlightSet`（集合等式双向包含断言，供 M3 渲染层直接调用）；benchmark 12 组反事实对端到端对账通过（Δ 集合 == `delta:edge:*` 期望，m2.test B3） |
| 阈值二分 | `src/bisect.js`：粗扫 256 等距点 → 细二分 ε=1e-6；证据对 `{field, v_star, v_plus_eps, verdict_at, verdict_plus_eps}` 自足（g(v*)≠g(v+ε) 且宽度≤ε）；无 search_range/非数值字段/未引用字段 → 如实 skip；0 转折 → no_boundary；>15 转折 → too_many；CLI `atlas.js bisect [--field f]` |
| **阈值对账口径（重要）** | 52 条阈值真值按可观测性三类归类（m2.test C3，逐包实测）：**裁定级 12**（每包 n4：下方 n7.no→V.fallback、上方 V.main）+ **path 级 12**（每包 n1：两侧裁定相同、后继链不同）+ **prefix_implied 28**（nB 链：链阈值 T-15-5i 恒低于 n1 门槛 T，可达域 [T,∞) 内结构性恒真，跨 T 无任何可观测变化）。**bisect 只对裁定级断言证据对；path 级/implied 如实归类不折算命中**（诚实口径，已登记 plan/00 决策记录）——M3 阈值面板与 M4 覆盖率对账沿用此口径 |
| YAML 子集 | `src/yaml.js`：**子集清单冻结在头注**（键值映射 + 2 空格缩进嵌套 + 块数组 + 行内 [..]{..} + 引号标量 + 注释剥离）；11 类越界语法显式报错（锚点/别名、多行串 \| >、Tab、多文档 ---、重复键、引号转义、标签 !!、.inf/.nan、无引号特殊字符、flow 未闭合、坏键）；`YamlError` 携带 E_YAML_* 码 + 行号；CLI 按扩展名分派（.yaml/.yml → parseYaml），越界 → **exit 2**（D4 实测） |
| 零规则字面量门禁 | `src/literalscan.js`：`deriveBannedTokens(rulesets)`（数值阈值整词匹配防 12 误中 120；单位数与 <1e-3 极小数（ε 类方法常量）排除；词 token ≥3 字符）+ `scanLiterals`（**含注释行**）；m2.test E1 扫描 src/engine|schema|graph|counterfactual|bisect|yaml 0 命中 + **E2 阳性对照**（植入阈值/词 token → 必红）+ E3 防空转（派生清单含 V.main/V.fallback 与数字清单非空）；**方法常量避让**：MAX_BOUNDARIES 刻意取 15（16 恰是 SYN-GAME 某包阈值，撞车被 E1 抓出后避让——门禁纪律的实证） |
| 测试全绿 | `npm test`（逐文件列出，K-10）→ **61 pass / 0 fail**（M1 的 42 + m2.test.js 19）；`npm run selftest` → SELFTEST_OK（engine sha `01fb56fb…` 与 M1 一致——tree 路径未动）；`node tools/gen_bench.js --check` → FROZEN_OK（25 文件，冻结件未动） |
| CLI 扩展 | `tools/atlas.js`：新增 `bisect` / `counterfactual`（--case-b）子命令 + YAML 输入通道；walk/build 兼容回归（build 产物 sha 与 M1 相同 `5e09ee9d…`） |
| 台账回写 | plan/00（能力表 ✅、里程碑 M2 ✅、决策记录 +1 条阈值口径）、plan/06（M2 完成实测 8 条） |

## 二、下一棒待办（M3 渲染完成）

按 `plan/06-里程碑详表.md` M3 节 + `plan/04-模块详设.md` §4/§5/§9 执行：

1. **布局 tidy 精化**：`src/layout.js` 从 v0 DFS 升级 Buchheim/tidy（缓解不平衡树观感）；升级前后保持双跑坐标全等 + 结构不变量（叶子 x 严格递增；断言口径从"父 x=子中点"放宽为"父 x 居中于子节点范围"）；
2. **渲染完成**：`src/render.js` 交互三件套——① 点击节点走通/路径高亮（已有 v0）；② **反事实 Δ 高亮**：改字段 → 重算 trace → `diffPaths` vs 基准案例 → 高亮 `onlyA ∪ onlyB`（断言用 `assertHighlightSet`，交互层零判定逻辑）；③ **阈值面板**：消费 `bisectAll` 证据对（构建期内嵌产物，或运行时触发——建议构建期预计算进 bundle 数据，保持运行时零算法）；
3. **产物契约不破**：内嵌三份 JSON（graph/ruleset/baseline）+ 无时间戳 + 无外链（白名单仅 w3.org）+ 双渲染逐字节一致（既有测试锁定，改动后必须保持全绿）；bundle 清单若新增模块（counterfactual/bisect），同步更新 `src/bundle.js` 调用与 vm 执行测试；
4. **headless 冒烟**：Edge `--headless --screenshot`（x86 路径、双反斜杠、先删旧 PNG、sleep 1~2），截图入仓证据；
5. **收尾**：`npm test` 全绿 → plan/00/06 回写 → `plan/HANDOFF-M4.md`（六节）→ commit。

**M3 明确不做**：覆盖率/validate.js/bench.js（M4）、SKILL.md/报告/发布（M5/M6）。

## 三、既定口径清单（K 编号，动了会打挂测试）

| # | 口径 | 位置 |
|---|---|---|
| K-1 | 退出码三语义：0 成功 / 1 内容校验失败 / 2 用法或输入形态不可用（**YAML 越界算 2**） | 04/07 D-07；`tools/atlas.js` |
| K-2 | canonical JSON：键按码点排序、无空白、非有限数与 undefined 抛错；graph 仅在 `default_verdict` 存在时携带该键 | `src/canonical.js`、`src/graph.js` |
| K-3 | 树模式为主；list 模式 = 编译通道（首命中语义）；`$default` 求值期解析（F-4）；case 必须完备 | 04 §1/§3、D-04/D-06 |
| K-4 | 确定性禁令：`src/`、`tools/` 禁 `Date.now`/`new Date(`/`Math.random(`（注释行豁免）；生成器 splitmix64 | 03 G4、D-08；`tests/hygiene.test.js` |
| K-5 | 产物契约：内嵌三份 JSON（graph/ruleset=原始规则集/baseline）；bundle 顶层拼接不包 IIFE；零外链白名单仅 w3.org | `src/render.js`、04 §9、D-11 |
| K-6 | 坐标唯一产出点：`src/layout.js`（不变量：叶子 x 严格递增、双跑全等；M3 断言放宽为父居中于子范围） | 04 §4、D-10 |
| K-7 | 零规则字面量：**正式门禁已建立**——`src/literalscan.js` 派生 token + m2.test E1/E2/E3；扫描面=engine/schema/graph/counterfactual/bisect/yaml（含注释）；**新增 src 模块若承载判定语义须加入扫描面** | 03 G3；`tests/m2.test.js` |
| K-8 | LF 纪律：`.gitattributes` + hygiene CR 守门（本机 `core.autocrlf=true`） | 03 G6 |
| K-9 | CI 类 DoD 措辞：未接远端一律写"本地等价校验（CI 待首推验证）" | 06 收尾纪律 |
| K-10 | **`npm test` 逐文件列出**（新增测试文件必须同步加进 package.json scripts.test） | package.json；04 §1.8 F-2 |
| K-11 | **trace.edges 含终端边**（F-5）；`nodePath` 只含条件节点（list 模式=已求值规则序列）；**list 模式全 miss 时末条规则的 no 边也是终端边** | 04 §2/§1.8；`src/engine.js` |
| K-12 | **benchmark 冻结件禁手改**：25 文件由 `tools/gen_bench.js` 生成；`--check` 必须保持 `FROZEN_OK` | 05 §三/§四；`tests/genbench.test.js` |
| K-13 | **gen_bench.js 被 import 不得执行 CLI**（入口守卫），否则测试进程被截断 | `tools/gen_bench.js` |
| K-14 | **阈值对账三类口径**：裁定级 12 / path 级 12 / prefix_implied 28（52 条真值）；bisect 证据对只对裁定级断言；`compileListToTree` 产物剥 mode/rules 键 | `tests/m2.test.js` C3/A3；plan/00 决策记录 2026-10-15 |
| K-15 | **YAML 子集清单冻结在 `src/yaml.js` 头注**；越界 = E_YAML_* → CLI exit 2；YAML 解析只管语法形态，语义校验仍归 schema.js | `src/yaml.js`；D-03 |

## 四、本机环境坑（全部实测）

1. **`node --test tests/`（目录参数）在 Git Bash + Node v24 下 MODULE_NOT_FOUND** → 逐文件列出（package.json 已配置，**m2.test.js 已追加**，新增文件记得再追加）。
2. **本机 `core.autocrlf=true`**：新文件靠 Write 工具 LF + `.gitattributes` 兜底；hygiene 扫全仓 CR。
3. **Edge 路径**：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（x86 目录）；headless 截图先删旧 PNG、`--screenshot="D:\\…"` 双反斜杠、启动后 `sleep 1~2` 再断言。
4. **临时脚本**：放 `.tmp/`（已 gitignore，用完删）并落 `.mjs` 文件；`node -e` 的动态 import 在 CommonJS eval 上下文不可靠（用 `node -e "import('…').then(…)"` 或 `.tmp/*.mjs`）。
5. **无 Python 依赖**（纯 JS 项目）；`bash` heredoc `cat > file <<'EOF'` 可用；node heredoc（`node - <<'EOF'`）适合改文档的精确字符串替换。
6. **genbench 守门测试含红向用例**（篡改 manifest 再恢复）：失败输出若见 `CHECK_FAIL` 先看是否恢复逻辑漏了 finally。
7. **M2 新增**：`yaml.js` 曾用 String.prototype 注入被否（全局污染 + bundle 风险）→ 行辅助一律纯函数；`.tmp` 目录删除后需 `mkdir -p .tmp` 再写。

## 五、DoD 逐项 checklist（M3，来自 plan/06）

- [ ] 同输入双渲染逐字节一致（sha256 断言，改动 render/layout 后保持）
- [ ] 无外链（白名单仅 w3.org）+ 无网络 API 扫描 0 命中
- [ ] 布局双跑坐标全等 + 结构不变量（tidy 精化后口径更新）
- [ ] 交互三件套：走通高亮（v0 已有）/ Δ 高亮（diffPaths + assertHighlightSet 契约）/ 阈值面板（bisect 证据对进产物）
- [ ] 交互层零判定逻辑（浏览器运行时只"取值 → 调引擎 → 映射展示"）
- [ ] headless 冒烟：截图非空、页面无 JS 报错（证据入仓）
- [ ] `npm test` 全绿（新增测试文件同步 package.json）+ plan/00/06 回写 + `plan/HANDOFF-M4.md` 落盘并 commit

## 六、关键命令速查

```bash
# 测试（逐文件；新增 tests/*.test.js 后同步追加到 package.json）
npm test

# 自检 / 构建 / 求值 trace
npm run selftest
node tools/atlas.js build data/samples/demo-game.rules.json --case data/samples/demo-game.case.json -o out/demo-game.html
node tools/atlas.js walk data/samples/demo-game.rules.json --case data/samples/demo-game.case.json

# M2 新命令
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

**续接提示词模板**：`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M3.md" 继续完成 M3 渲染完成`
