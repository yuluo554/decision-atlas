# decision-atlas

**规则集 → 确定性求值 → 可交互单文件 HTML 决策树**（反事实路径差 · 阈值二分 · 零依赖）。

> 状态：**M4 校验与基准完成**（M0 计划先行、M1 数据先行、M2 确定性内核、M3 渲染、M4 校验与基准已完成；SKILL 与报告 M5、发布 M6 逐棒推进）。
> 把一份 eligibility／风控／政策规则集（JSON/YAML）编译成**可点击走通、可反事实对比、可自动校验**的单文件 HTML 决策树——每个输出节点由规则引擎**确定性求值**，不是模型"画个大概"。**做会算的图，不是好看的图。**

## 与"AI 画图"的本质区别

| 渲染语义（通用图表工具） | **求值语义（本项目）** |
|---|---|
| 能画出决策树的形状 | 每条边、每个裁定由规则引擎**逐条布尔求值** |
| 布局确定性 | **求值确定性**：同输入重复运行字节级一致（sha256 断言） |
| 无反事实 | **反事实路径差**：高亮分叉边集合 == `path(A) Δ path(A')`（可断言） |
| 无临界点 | **阈值二分**：临界值 v* 满足 `eval(v*) ≠ eval(v*+ε)`（可证伪） |
| 产物难校验 | 内嵌 `__DECISION_GRAPH__` JSON 按 schema 断言 + 覆盖率自检 |

**坐标由算法算**（tidy-tree 系布局），**模型永不产出坐标、永不产出裁定**；纯本地处理，规则集不上传、零网络请求、单文件 HTML 无 CDN 无外部资源。

## 快速开始（零依赖：无需 `npm install`，只需 Node ≥ 20）

```bash
node tools/atlas.js selftest          # 内置自检（确定性双跑 + 渲染双跑 + 无外链）
node tools/atlas.js build data/samples/demo-game.rules.json --case data/samples/demo-game.case.json -o out/demo-game.html
# 然后用浏览器直接打开 out/demo-game.html（file:// 即可，离线可交互）
node tools/atlas.js walk data/samples/demo-game.rules.json --case data/samples/demo-game.case.json   # 查看求值 trace
node tools/validate.js data/samples/demo-game.rules.json out/demo-game.html --check  # 产物校验（不变量 + 重渲染逐字节比对）
node tools/bench.js                   # 真值基准：一条命令出指标表（data/benchmark 冻结件）
npm test                              # 运行测试套件（node:test，零第三方依赖）
```

退出码约定（全部工具统一）：`0` 成功 / `1` 内容校验失败 / `2` 用法或输入形态不可用。

## 基准指标（M4 末态，`node tools/bench.js` 实测回填）

门槛随 `data/benchmark/manifest.json` 的 `thresholds` 节下发（全指标下限 1.0）。12 套件（4 白名单场景 × 3 档）末态实测：

| 指标 | 实测 | 说明 |
|---|---|---|
| 路径准确率 | 1.000（72/72 案例） | expect 键（node:*/edge:*）全命中案例占比 |
| 裁定准确率 | 1.000（72/72） | verdict:* 命中占比 |
| 临界点命中率 | 1.000（52/52 真值） | 裁定级 12 条 bisect 证据对复核 + path 级 12 条 + prefix_implied 28 条如实登记 |
| 不可达检出 | precision 1.000 / recall 1.000（12 条植入） | coverage 抽象解释 vs 约束影子植入集合；模板外恒真额外检出如实登记不折算 |
| 恒真检出 | recall 1.000（12 条 n5 prefix_implied） | precision 不设门槛（nB*/n6 结构性恒真是模板事实，FP 如实展示） |
| 反事实 Δ 对账 | 12/12 集合等式 | delta:edge:* 期望 == diffPaths 实测（双向包含） |
| 探活必红 | 48/48（4 缺陷 × 12 套件全 exit 1） | 篡改期望 / 坏引用规则集 / 边界挪动 ε 外 / 不可达注入 |

抽样非穷举声明：分母 = 12 规则包 / 112 节点 / 72 案例（`manifest.totals`）。

## 仓库结构

```
src/      规则引擎、schema 校验、布局、渲染（确定性内核，零第三方依赖）
tools/    atlas.js CLI（selftest / build / walk）
data/     数据台账与合成样例（白名单假业务场景；基准数据 M1 入仓）
tests/    node:test 测试套件
plan/     项目计划（00–07 + 交接快照 HANDOFF-M*.md）
docs/     技术报告与演示素材（M5）
```

## 路线图

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 计划先行 + 可运行骨架 | ✅ |
| M1 | schema v1 冻结 + 合成基准数据（植入真值） | ✅ |
| M2 | 确定性内核（引擎 + 反事实 Δ + 阈值二分 + YAML 子集） | ✅ |
| M3 | 单文件 HTML 渲染完成（tidy 布局 + 交互） | ✅ |
| M4 | 校验器 + 覆盖率自检 + 真值基准 | ✅ |
| M5 | SKILL.md + 技术报告 + 演示素材 | ⬜ |
| M6 | GitHub 公开发布 + Release | ⬜ |

## 边界与声明

- 本工具是**编译器/可视化器**：规则集由用户提供，不做规则集创作；裁定 = 规则集的机械求值结果（工程可证伪承诺，不构成业务/合规/医疗意见）。
- 演示与基准一律使用**虚构的假业务场景**（白名单：`SYN-*`），与任何真实机构无关。
- 现状为骨架版：交互只含路径重算与裁定展示；反事实 Δ 高亮与阈值面板 M3 接入。

## 许可

[MIT](LICENSE) © 2026 yuluo554
