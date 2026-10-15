# decision-atlas 技术报告

> 末态：2026-10-15（M5）。本文档所有断言均可由仓库内命令复现，复现命令逐条给出；不含无法复现的断言。
> 配套阅读：`SKILL.md`（操作入口）、`README.md`（快速开始与指标表）、`plan/00–07`（计划与决策记录）。

---

## 一、问题与定位

把一份 eligibility／风控／政策类规则集编译成**可交互单文件 HTML 决策树**。与"AI 画图"类通用图表工具的本质区别在于**求值语义**而非**渲染语义**：每条边、每个裁定由规则引擎逐条布尔求值，而不是画个大概形状。三条工程承诺贯穿全部模块：

1. **求值确定性**：同输入重复运行字节级一致；
2. **可证伪**：反事实路径差、阈值临界点、覆盖率结论全部给出机器可复核的判据；
3. **纯本地零依赖**：单文件 HTML 无 CDN 无外部资源，规则集不上传，工具链零第三方依赖（Node ≥ 20 + 浏览器共通 ES2020 子集）。

坐标由算法计算（tidy 布局），模型（若有 LLM 参与）永不产出坐标、永不产出裁定——本工具本身不含任何模型调用。

## 二、求值语义（`src/schema.js` / `src/engine.js` / `src/graph.js` / `src/yaml.js`）

**数据模型**：树模式为主——显式条件节点 `{id, label, condition, branches: {yes, no}}`，全树必须终止于裁定节点（无环/无悬空/无孤儿，schema 校验 `E_CYCLE`/`E_REF`/`E_UNREACHABLE` 等错误码全量拒绝，不猜测）。条件为原子 `{field, op, value}` 或递归 `all/any`；字段四类型 `number/boolean/enum/string`，算子白名单 `>= > <= < == != in not_in`（`src/engine.js:30-37`），越界即 `E_OP`。

**列表模式作为编译通道**：`mode: "list"` 的有序规则（首命中生效，必填 `default_verdict`）在加载时由 `compileListToTree`（`src/graph.js`）编译为等价树，之后求值/布局/覆盖率全部只面对树口径——"节点数=规则数"等不变量因此有唯一定义。编译与直通双向对账锁进测试。

**求值 trace**：`trace(case) → {nodePath（仅条件节点）, edges（含终端边）, verdict}`。边含终端边（裁定叶出边）是 F-5 勘误后的冻结口径，使路径差与高亮在叶上也有身份可言。

**输入格式**：JSON 为规范格式；YAML 只支持文档化子集（块映射/序列、标量、单行内联流），锚点/别名/多文档/多行标量等越界语法显式报 `E_YAML_*`（exit 2），绝不猜测；语义校验与 JSON 共用同一 schema 层。

**确定性序列化**：canonical JSON（键按码点排序、无空白、非有限数抛错，`src/canonical.js`）+ sha256；`src/`、`tools/` 禁 `Date.now`/`Math.random`（守门测试扫描，注释行豁免），产物无时间戳。

## 三、确定性布局（`src/layout.js`）

tidy-tree 系（Reingold–Tilford 思路）手写实现：叶节点按中序分配 x，父节点取子节点中点回填，深度决定 y；纯函数、常量集中、坐标唯一产出点。M3 精化引入**裁定叶按引用实例化**（同一裁定被多处引用时实例化为 `id` / `id#k`）与 `edgeTarget`/`leafSequence` 契约，保证：13 个基准包双跑全等、叶序递增、父居中、无重叠。渲染层只消费坐标，不得产坐标——这是"坐标可断言"（G2）的落点。

否决项备忘：力导向布局被否决（依赖迭代/种子，违背确定性纪律）；第三方布局库被否决（零依赖）。

## 四、可证伪设计：反事实路径差与阈值二分（`src/counterfactual.js` / `src/bisect.js`）

**反事实路径差**。边身份 = `from + ':' + branch`（目标由树结构唯一决定，不参与身份）。`diffPaths(traceA, traceB)` 返回 `onlyA/onlyB/common/divergeIndex/divergeNode`，其中 onlyA/onlyB 即 `path(A) Δ path(B)` 对称差的两侧。**断言契约**：HTML 高亮的分叉边集合必须与该对称差**集合相等**（`assertHighlightSet` 双向包含都断言）——高亮不是装饰，是可断言的语义对象。基准对账：12 组反事实案例对 Δ 集合等式 12/12（`node tools/bench.js`）。

**阈值二分**。定义全裁定函数 `g_f(v) = trace(A[field f := v]).verdict.id`（其他字段固定在基准案例 A）。两段独立可复现：粗扫 256 等距点（含端点）找相邻异值对 → 每对细二分至区间 ≤ ε（ε=1e-6）。输出**证据自足**的证据对 `{field, v_star, v_plus_eps, verdict_at, verdict_plus_eps}`，第三方复核判据仅为：`g(v*) ≠ g(v*+ε)` 且 `v*+ε − v* ≤ ε`——复核不需要信任实现内部状态。不做单调性假设（多转折逐一如实报告，上限 15，`MAX_BOUNDARIES` 刻意避开全部基准阈值取值以过零规则字面量门禁）；字段未声明 `search_range` 则如实 `skip`（不猜范围）。

**诚实口径**：52 条临界点真值分三类复核——裁定级 12 条（bisect 证据对断言）、path 级 12 条、prefix_implied 28 条，如实归类不折算。复现：`node tools/atlas.js bisect data/samples/demo-game.rules.json --case data/samples/demo-game.case.json`（level/wins 各出一条 BOUNDARY 证据对）。

## 五、覆盖率自检：三值逻辑与诚实口径（`src/coverage.js`）

沿树做**抽象解释**：number 字段维护区间含端点开闭，boolean/enum 维护值集；三值逻辑（true/false/unknown）评估每条条件的可达性。两类刻意的不细化（宁可少报不假报）：

- **复合条件（all/any）的否定分支**不细化 → 标 `unknown`；
- **数域 `==`/`!=` 的挖点**不细化 → 标 `unknown`。

前缀矛盾（如先 `x≥70` 后 `x<30`）仍可判定为 `unreachable_branch`；恒真分支（`tautology`）与 `contradiction` 显式分类。报告 JSON/文本双轨（`analyze`/`reportText`/`findingKeys`），list 模式经 `compileListToTree` 直通，纯函数双跑一致。

**为什么保守是对的**：覆盖率结论本身是被基准对账的对象——分母锚定 manifest（12 包 / unreachable_branches=12 / tautology_branches=12），对不上的如实报 unknown，不折算成命中。

## 六、校验器与真值基准（`tools/validate.js` / `tools/bench.js` / `tools/gen_bench.js` + `data/benchmark`）

**校验器**两级：产物自检（抽取四份内嵌 JSON → 图不变量 1–4（节点数=规则数/边=条件极性/无孤儿/叶子终止）+ SVG 坐标有限 + 零外链（白名单仅 w3.org 命名空间）+ 无时间戳）；`--check` 按显式规则集重渲染并与产物 sha256 **逐字节比对**（防产物与规则集脱钩；规则集必须显式给出，防对内嵌规则集自证）。退出码三语义统一：0 成功 / 1 内容校验失败 / 2 用法或输入形态不可用。

**真值基准**。数据先行：4 个白名单虚构场景 × 3 档 = 12 规则包 / 112 节点 / 72 案例，由 `gen_bench.js`（splitmix64 确定性生成器）生成 25 个冻结文件，`--check` 位级守门（禁手改；改数据必须走生成器重生成）。`bench.js` 装载数据时**先锚定**（生成器输出 == 磁盘位级）再对账；植入真值 88 条（expect 键 `node:*/edge:*/verdict:*/delta:edge:*`、边界真值、不可达/恒真植入集合）随 manifest 下发。

**末态指标**（`node tools/bench.js`，exit 0）：

| 指标 | 实测 |
|---|---|
| 路径准确率 / 裁定准确率 | 1.000（72/72） |
| 临界点命中率 | 1.000（52/52 真值，三类归类复核） |
| 不可达检出 P / R | 1.000 / 1.000（12 条植入） |
| 恒真检出 recall | 1.000（12 条 n5 prefix_implied；precision 不设门槛——nB*/n6 结构性恒真是模板事实，额外检出如实登记不折算） |
| 反事实 Δ 对账 | 12/12 集合等式 |
| 探活必红 | 48/48（expect 篡改 / ref 坏引用 / boundary 边界挪动 ε 外 / unreachable 注入，4 缺陷 × 12 套件全 exit 1） |

探活是防"期望同源假绿"的关键：四类缺陷注入后基准**必须**报未达标（exit 1），证明指标表真的在看数据而不是在自我确认。复现：`node tools/bench.js --probe boundary SYN-CREDIT-001`（应 exit 1）。

**测试**：`npm test` 83 项全绿（node:test，零第三方依赖，逐文件列出——目录形式在本机 Git Bash + Node v24 下不可用）；`node tools/atlas.js selftest` SELFTEST_OK（确定性双跑 + 渲染双跑 + 无外链）。

## 七、渲染与交互（`src/render.js` / `src/bundle.js`）

单文件 HTML 契约（D-11）：预渲染 SVG + 内联引擎（自研极简 bundler 顶层拼接、非模块脚本，file:// 兼容）+ 四份内嵌 JSON（graph/ruleset/baseline/bisect，`<` 全转义）。交互三件套：走通高亮（点击重算）、Δ 高亮（消费 `diffPaths` 结果，红色虚线）、阈值面板（构建期预计算进 `atlas-bisect` 内嵌 JSON，**运行时零算法**）。交互层零判定逻辑（静态扫描守门）——浏览器只做展示与高亮消费，求值语义全部来自与 CLI 同源的引擎代码。同输入双渲染 sha256 逐字节一致。

## 八、纪律体系（G1–G6）

| 门 | 内容 | 守门方式 |
|---|---|---|
| G1 求值确定性 | canonical JSON + sha256 + 引擎纯函数 | 双跑断言、selftest |
| G2 坐标可断言 | 坐标唯一产出点 `src/layout.js` | 布局双跑 + 渲染字节级一致测试 |
| G3 零规则字面量 | 引擎/渲染源码不得含规则集阈值 | literalscan 派生 token 门禁（扫描面：engine/schema/graph/counterfactual/bisect/yaml）+ 阳性对照必红 |
| G4 无时钟无随机 | 禁 `Date.now`/`Math.random`（注释豁免）；产物无时间戳 | 源码扫描测试（含 coverage/validate/bench） |
| G5 零外链零网络 | 白名单仅 w3.org 命名空间 | 产物扫描测试 + headless 冒烟 |
| G6 字节纪律 | LF + canonical 稳定 | `.gitattributes` + CR 守门测试 |

## 九、边界与扩展

**当前边界**：树/列表两种模式；算子白名单 8 个；数域二分仅 number 字段；复合条件否定分支覆盖率为 unknown（诚实不细化）；YAML 为文档化子集；基准为合成虚构场景（抽样非穷举，分母 = 12 包 / 112 节点 / 72 案例，manifest.totals）。

**扩展点**（按当前架构均无需推翻内核）：

1. 覆盖率细化：对 `all/any` 否定分支与 `==`/`!=` 数域做区间分裂，可把 unknown 降为可判定——代价是实现复杂度，收益需与假报风险权衡；
2. 算子/类型扩展：白名单加算子只需 engine + schema + coverage 三处同步；
3. 布局：tidy 已冻结，换布局算法不影响求值语义（坐标与语义解耦）；
4. 基准扩充：加场景只需扩展 gen_bench 模板并重生成（门槛随 manifest.thresholds 下发，数据非代码）；
5. 发布：GitHub 公开仓库 + Release（M6），CI 四矩阵全绿（ubuntu/windows × node 22/24，2026-10-15 首推实跑：3 push = 3 run，前两轮失败如实留档 plan/RELEASE-M6.md）。

## 十、复现命令索引

```bash
npm test                                                  # 83 项测试全绿
node tools/atlas.js selftest                              # SELFTEST_OK
node tools/atlas.js build data/samples/demo-game.rules.json --case data/samples/demo-game.case.json -o out/demo-game.html
node tools/validate.js data/samples/demo-game.rules.json out/demo-game.html --check   # VALIDATE_OK
node tools/atlas.js bisect data/samples/demo-game.rules.json --case data/samples/demo-game.case.json  # 证据对
node tools/atlas.js counterfactual data/samples/demo-game.rules.json --case data/samples/demo-game.case.json --case-b <caseB>
node tools/bench.js                                       # BENCH_OK 12 suites
node tools/bench.js --probe boundary SYN-CREDIT-001       # 探活必红 exit 1
node tools/gen_bench.js --check                           # FROZEN_OK
```
