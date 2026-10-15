# SKILL.md — decision-atlas 技能说明书

把一份 eligibility／风控／政策类规则集（JSON 或受限 YAML）编译成**可交互单文件 HTML 决策树**：每个输出节点由规则引擎确定性求值，支持反事实路径差高亮与阈值二分临界点面板，产物可自动校验。

**核心承诺：做会算的图，不是好看的图。** 坐标由算法计算，裁定由引擎逐条布尔求值——本工具不发明规则、不产坐标、不调用模型、不上传数据。

---

## 一、何时使用（触发词）

当出现以下需求时使用本技能：

- 「把这个规则集/判定逻辑画成决策树」「把 eligibility/风控/政策规则编译成可交互图」；
- 「两个输入案例的判定路径差在哪里」（反事实对比）；
- 「某个数值字段的临界值是多少」（阈值二分）；
- 「这套规则有没有不可达分支/恒真分支」（覆盖率自检）;
- 「产物 HTML 是否和规则集一致」（校验器 `--check`）。

不适用：需要模型"生成规则建议""优化规则"的场景——本工具是编译器/可视化器，规则集必须由用户提供且自足。

## 二、输入契约

### 规则集（树模式，规范格式）

```jsonc
{
  "schema_version": "1",
  "ruleset_id": "MY-RULES-001",
  "title": "标题",
  "inputs":  [ { "key": "level", "type": "number", "label": "等级", "search_range": [0, 200] },
               { "key": "member", "type": "boolean", "label": "会员" },
               { "key": "tier", "type": "enum", "label": "段位", "values": ["bronze","silver","gold"] } ],
  "verdicts": [ { "id": "V.ok", "label": "通过", "kind": "approve" } ],   // kind ∈ approve/refer/reject
  "root": "n1",
  "nodes": [ { "id": "n1", "label": "等级门槛",
               "condition": { "field": "level", "op": ">=", "value": 30 },
               "branches": { "yes": "n2", "no": "V.ok" } } ]
}
```

要点：

- 四类字段类型 `number / boolean / enum / string`；算子白名单 `>= > <= < == != in not_in`；复合条件用递归 `all / any`；
- 全树必须终止于裁定节点（无环/无悬空/无孤儿）；case 必须完备（缺字段报错，不猜默认值）；
- **列表模式**（有序规则、首命中生效）作为编译通道：`mode: "list"` + `rules` + 必填 `default_verdict`，加载时编译为树，对外口径不变。

### 受限 YAML（可选输入形态）

YAML 只支持文档化子集：块映射/块序列、标量、单行内联 JSON 流；**明确不支持**锚点/别名（`& *`）、多文档（`---` 分隔）、流式集合嵌套、多行标量（`| >`）、标签（`!`）、引号内逗号嵌套等——命中即报 `E_YAML_*`（exit 2），绝不猜测。语义校验与 JSON 共用同一 schema 层。

### 案例（case）

与 `inputs` 声明一一对应的 JSON 对象，如 `{"level": 42, "wins": 128, "member": false, "tier": "gold"}`。多余/缺失/类型不符均报错。

### 错误码表（schema 层）

| 码 | 含义 | | 码 | 含义 |
|---|---|---|---|---|
| `E_SCHEMA_VERSION` | schema_version 非 "1" | | `E_FIELD_UNKNOWN` | condition 引用未声明字段 |
| `E_REQUIRED` | 必填键缺失 | | `E_OP` | 算子不在白名单 |
| `E_TYPE` | 字段/值类型不符 | | `E_VALUE` | 值域不符（如 enum 值未声明） |
| `E_ID_DUP` | 节点/裁定 id 重复 | | `E_COMPOUND_EMPTY` | all/any 空数组 |
| `E_ROOT_MISSING` | root 指向不存在节点 | | `E_SEARCH_RANGE` | search_range 形态非法 |
| `E_REF` | 分支引用不存在 | | `E_MODE` | mode 非法 |
| `E_CYCLE` | 条件节点成环 | | `E_DEFAULT_MISSING` | list 模式缺 default_verdict |
| `E_UNREACHABLE` | 存在从 root 不可达的节点 | | `E_CASE_*` | case 缺失/多余/值错 |

YAML 语法越界统一报 `E_YAML_*`。

### 退出码（全部工具统一，K-1）

`0` 成功 / `1` 内容校验失败 / `2` 用法或输入形态不可用（缺参数、缺文件、坏 JSON、YAML 越界）。

## 三、命令（零依赖：无需 npm install，Node ≥ 20）

```bash
# 0) 内置自检（确定性双跑 + 渲染双跑 + 无外链）
node tools/atlas.js selftest

# 1) 编译单文件 HTML（file:// 直接打开，离线可交互）
node tools/atlas.js build <rules.json|yaml> --case <case.json> -o out/demo.html

# 2) 打印求值 trace（nodePath 条件节点序列 + edges 含终端边 + 裁定）
node tools/atlas.js walk <rules> --case <case.json>

# 3) 阈值二分：临界点证据对（v* 与 v*+ε 裁定不同；ε=1e-6，粗扫 N0=256）
node tools/atlas.js bisect <rules> --case <case.json> [--field <f>]

# 4) 反事实路径差：两案例路径对称差（only_a / only_b 边集合）
node tools/atlas.js counterfactual <rules> --case <c1> --case-b <c2>

# 5) 产物校验：图不变量 + SVG 坐标有限 + 零外链 + 无时间戳；
#    --check 按显式规则集重渲染并与产物 sha256 逐字节比对（防产物与规则集脱钩）
node tools/validate.js <rules> <product.html> --check
node tools/validate.js <product.html>            # 仅产物自检（不比对规则集）

# 6) 真值基准：12 套件指标表（数据冻结件 data/benchmark）
node tools/bench.js                              # 全量，exit 0 = 全达标
node tools/bench.js --only <suite-id>            # 白名单单套件（未知名 exit 2）
node tools/bench.js --probe <kind> <suite-id>    # 探活必红：kind ∈ expect/ref/boundary/unreachable，注入缺陷必 exit 1
node tools/bench.js --json -o out/bench-report.json

# 7) 基准冻结件守门（禁手改 data/benchmark；改数据走生成器再重生成）
node tools/gen_bench.js --check                  # FROZEN_OK / CHECK_FAIL

# 8) 测试套件（node:test，零第三方依赖）
npm test
```

产物 HTML 内嵌四份 JSON（graph / ruleset / baseline / bisect），自带走通高亮、反事实 Δ 高亮（红色虚线）与阈值面板，交互在浏览器内完成、零网络请求。

## 四、边界（明示不做）

- **不发明规则**：规则集由用户提供，本工具不做规则创作/补全/改写；裁定 = 规则集的机械求值结果；
- **不产坐标**：坐标唯一产出点是 `src/layout.js`（tidy 布局算法），无任何手写/模型给定的坐标；
- **纯本地**：零网络请求、单文件 HTML 无 CDN 无外部资源（零外链白名单仅 w3.org 命名空间）、规则集不上传；
- **确定性**：同输入重复运行字节级一致（产物无时间戳，sha256 断言）；`src/`、`tools/` 禁 `Date.now`/`Math.random`；
- 覆盖率口径**诚实保守**：证明不了的分支如实标 `unknown`，不折算成命中。

## 五、自定义指引

| 可改 | 不可改 |
|---|---|
| 规则集内容（inputs/verdicts/nodes 全部业务语义） | 产物内嵌 JSON 的结构与键名（schema v1 冻结） |
| 节点/裁定 label 文案 | 坐标（唯一产出点 `src/layout.js`，手改无效且会被校验器捕获） |
| 渲染配色（`src/render.js` 顶部样式常量） | 裁定结果（由引擎求值决定，不可注入） |
| 输出路径与案例数值 | 退出码三语义（0/1/2，工具间统一契约） |

改完规则集后务必跑 `node tools/validate.js <rules> <product.html> --check` 确认产物未与规则集脱钩；改动 `data/benchmark/` 任何文件必须走 `node tools/gen_bench.js` 重生成（直接手改会被 `--check` 与 bench 锚定双重拦截）。

## 六、全流程演练（按序执行，全部应成功）

```bash
# 前置：仓库根目录，Node >= 20
node tools/atlas.js selftest                                              # SELFTEST_OK，exit 0
node tools/atlas.js build data/samples/demo-game.rules.json \
  --case data/samples/demo-game.case.json -o out/demo-game.html           # BUILD_OK + sha256，exit 0
node tools/validate.js data/samples/demo-game.rules.json out/demo-game.html --check   # VALIDATE_OK，exit 0
node tools/atlas.js walk data/samples/demo-game.rules.json \
  --case data/samples/demo-game.case.json                                 # 打印 trace，exit 0
node tools/atlas.js bisect data/samples/demo-game.rules.json \
  --case data/samples/demo-game.case.json                                 # level/wins 两条 BOUNDARY 证据对；非 number 字段（boolean/enum）显示 SKIP，属正常
node tools/bench.js                                                       # BENCH_OK 12 suites，exit 0
npm test                                                                  # 83 pass / 0 fail
```

浏览器打开 `out/demo-game.html`（file:// 即可）验证交互：点击节点走通高亮、选择对比案例看 Δ 红色虚线、展开阈值面板看临界点证据对。完整演示素材见 `docs/demo/`，技术报告见 `docs/report.md`。
