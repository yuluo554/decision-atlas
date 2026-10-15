# HANDOFF-M2（→ M2 确定性内核）

> **用法**：新对话以 `/goal 读取 "<项目绝对路径>\plan\HANDOFF-M2.md" 继续完成任务` 启动（绝对路径只出现在用户侧启动命令，本文件内一律相对路径）。
> **项目根**：仓库根（本文件所在 `plan/` 的上一级）。

---

## 一、当前进度 + 证据（M0 + M1 已完成，2026-10-15）

**M0 = 计划先行 + 可运行骨架（详见 HANDOFF-M1 归档结论）；M1 = 数据先行，全部完成**：

| 项 | 证据 |
|---|---|
| schema v1 冻结 | `plan/04-模块详设.md` §1（冻结稿）+ **§1.8 实测勘误 F-1~F-5** 逐条留档；`src/schema.js` 同步（enum 成员限字符串）；`demo-game` 样例核对兼容、无需迁移（台账留档） |
| `tools/gen_bench.js` | splitmix64 固定 seed（BigInt，`SEED=0x53594e42n`）；4 白名单场景参数化模板；真值四定式植入（阈值 / 约束影子不可达 / 前缀蕴含恒真 / 反事实对）；`--check` 位级守门；**注意：被 import 时不执行 CLI**（入口守卫，测试依赖此行为） |
| `data/benchmark/` 冻结 | **25 文件**：12 规则包（4 场景 × 小/中/大，7/9/12 节点，合计 112 节点）+ 12 案例文件（**72 案例**：每包 base/alt 反事实对 + T±1/T±0.5 边界 4 例）+ manifest.json；真值条目 88（阈值 52 / 不可达 12 / 恒真 12 / 反事实对 12）；**禁手改**，改需求=改生成器+整组重生成 |
| 双跑字节一致 | 两次运行 25 文件聚合 sha256 相等（实测 `c54581e6…`）；产物键序固定、无时间戳 |
| `--check` 红绿双向 | 绿：`FROZEN_OK 25 files` / exit 0；红：篡改 manifest → `CHECK_FAIL` / exit 1（列出差异文件）；恢复 → 复绿（**双向实测**） |
| 真值对账 | 72 案例期望与引擎全量对账通过（期望键 verdict:/node:/edge:/delta:/boundary:；Δ 边集合等式、边界对真跨 T 均实测）——对账逻辑在 `tests/genbench.test.js`，M4 的 `tools/bench.js` 应复用同一比较语义 |
| 测试全绿 | `npm test`（**逐文件列出**，K-10/F-2）→ **42 pass / 0 fail**（原 32 + genbench 10） |
| selftest | `npm run selftest` → `SELFTEST_OK`（engine sha 因 F-5 变为 `01fb56fb…`，属预期） |
| headless 冒烟 | Edge headless 截图复验：初始裁定正确 + 路径高亮**含终端边**（F-5 修复后 edges 与 SVG line.edge 一一对应） |
| 台账回写 | plan/00（M1 状态 + 决策记录 3 条）、plan/04（冻结稿 + §1.8）、plan/05（§2.2/§2.3 定稿 + 待核对项闭环）、plan/06（M1 ✅）、data/README（M1 末态数字 + 白名单定稿） |

## 二、下一棒待办（M2 确定性内核）

按 `plan/06-里程碑详表.md` M2 节 + `plan/04-模块详设.md` §2/§5/§6 执行：

1. **引擎全量（tree+list）**：`src/engine.js` 补 list 模式（按序求值、首命中生效、无命中 → `default_verdict`；nodePath=已求值规则序列含命中条）；`src/schema.js` 解除 list 模式 E_MODE 拒绝并补 `rules`/`default_verdict` 校验；`src/graph.js` 补 list→tree 编译（`rN → no: $default`）+ **编译等价性对账测试**（对任意案例列表语义 ≡ 树语义）；
2. **反事实路径差**：`src/counterfactual.js`（§5）：`diffPaths(traceA, traceB)` → `{onlyA, onlyB, common, divergeIndex, divergeNode}`；边身份 = `from+branch`；断言契约 = 高亮集合 == `path(A) Δ path(A')`（双向包含）；用 benchmark 12 组反事实对做端到端对账（期望已冻结在 `delta:edge:*` 键）；
3. **阈值二分**：`src/bisect.js`（§6）：粗扫 256 点 + 细二分至 `b-a ≤ ε`（ε=1e-6）；报告 `{field, v_star, v_plus_eps, verdict_at, verdict_plus_eps}`；无 search_range → 如实 skip；对 benchmark 52 条已知阈值做命中对账（期望在 `boundary:n*:field:*:T:*` 键）；CLI 接入 `atlas.js bisect`；
4. **YAML 子集**：`src/yaml.js`（§2 交付物）：子集清单先写进文档再实现（防范围失控）；正反例测试；越界语法 exit 2；
5. **零规则字面量正式门禁**（K-7）：从规则集派生禁用 token 清单（含数值阈值、枚举值、裁定 id）+ selftest 阳性对照（故意植入 → 必红）；扫描面含注释；
6. **收尾**：`npm test` 全绿 → plan/00/06 状态回写 → `plan/HANDOFF-M3.md`（六节）→ commit。

**M2 明确不做**：渲染改动（M3）、覆盖率/validate.js/bench.js（M4）、SKILL.md/报告（M5）。

## 三、既定口径清单（K 编号，动了会打挂测试）

| # | 口径 | 位置 |
|---|---|---|
| K-1 | 退出码三语义：0 成功 / 1 内容校验失败 / 2 用法或输入形态不可用 | 04/07 D-07；`tools/atlas.js` |
| K-2 | canonical JSON：键按码点排序、无空白、非有限数与 undefined 抛错；graph 仅在 `default_verdict` 存在时携带该键 | `src/canonical.js`、`src/graph.js` |
| K-3 | 树模式为主；list 模式 = M2 编译通道（首命中语义）；`$default` 哨兵求值期解析（F-4）；case 必须完备 | 04 §1/§3、D-04/D-06 |
| K-4 | 确定性禁令：`src/`、`tools/` 禁 `Date.now`/`new Date(`/`Math.random(`（注释行豁免）；生成器 splitmix64 | 03 G4、D-08；`tests/hygiene.test.js` |
| K-5 | 产物契约：内嵌三份 JSON（graph/ruleset=原始规则集/baseline）；bundle 顶层拼接不包 IIFE；零外链白名单仅 w3.org | `src/render.js`、04 §9、D-11 |
| K-6 | 坐标唯一产出点：`src/layout.js`（不变量：父 x=子中点、叶子 x 严格递增、双跑全等）；渲染只消费 | 04 §4、D-10 |
| K-7 | 零规则字面量：engine 源码禁样例规则 token；M2 建正式门禁（派生 token + selftest 阳性对照） | 03 G3；`tests/hygiene.test.js` |
| K-8 | LF 纪律：`.gitattributes` + hygiene CR 守门（本机 `core.autocrlf=true`） | 03 G6 |
| K-9 | CI 类 DoD 措辞：未接远端一律写"本地等价校验（CI 待首推验证）" | 06 收尾纪律 |
| K-10 | **`npm test` 逐文件列出**（目录形式本机 MODULE_NOT_FOUND；新增测试文件必须同步加进 package.json scripts.test） | package.json；04 §1.8 F-2 |
| K-11 | **trace.edges 含终端边**（F-5）：edges 与产物 SVG line.edge 一一对应；`nodePath` 只含条件节点；单步路径也有终端边 | 04 §2/§1.8；`src/engine.js`、`tests/engine.test.js` |
| K-12 | **benchmark 冻结件禁手改**：25 文件由 `tools/gen_bench.js` 生成；`--check` 必须保持 `FROZEN_OK`；期望键名自带结论、取值恒 true；案例层不携带不可达/恒真断言（那是 manifest 的规则集级真值） | 05 §三/§四；`tests/genbench.test.js` |
| K-13 | **gen_bench.js 被 import 不得执行 CLI**（入口守卫 `import.meta.url === pathToFileURL(process.argv[1]).href`），否则测试进程被 process.exit 截断、静默丢测试 | `tools/gen_bench.js`（M1 实测坑） |

## 四、本机环境坑（全部实测）

1. **`node --test tests/`（目录参数）在 Git Bash + Node v24 下 MODULE_NOT_FOUND** → 逐文件列出（package.json 已配置，新增测试文件记得追加）。
2. **本机 `core.autocrlf=true`**：新文件靠 Write 工具 LF + `.gitattributes` 兜底；hygiene 扫全仓 CR。
3. **Edge 路径**：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（x86 目录）；headless 截图先删旧 PNG、`--screenshot="D:\\…"` 双反斜杠、启动后 `sleep 1~2` 再断言。
4. **临时脚本**：放 `.tmp/`（已 gitignore，用完删）并落 `.mjs` 文件；`node -e` 的动态 import 在 CommonJS eval 上下文不可靠；`.tmp` 目录被删后需 `mkdir -p .tmp` 再写。
5. **无 Python 依赖**（纯 JS 项目）；`bash` heredoc `cat > file <<'EOF'` 可用（引号防展开）。
6. **genbench 守门测试含红向用例**（篡改 manifest 再恢复）：失败输出若见 `CHECK_FAIL` 先看是否恢复逻辑漏了 finally。

## 五、DoD 逐项 checklist（M2，来自 plan/06）

- [ ] 同输入双跑 sha256 相等（引擎级断言，tree+list 双模式）
- [ ] 零规则字面量扫描 0 命中 + 探活（故意植入阈值 → 必红）
- [ ] 反事实：高亮集合 == `path(A) Δ path(A')`（双向包含断言）+ benchmark 12 组反事实对端到端对账
- [ ] 阈值：每条报告边界满足 `g(a*) ≠ g(b*)` 且 `b*-a* ≤ ε`；粗扫+细二分两段独立复现；与 benchmark 52 条已知阈值对账
- [ ] YAML 子集样例通过；越界语法显式报错（exit 2）
- [ ] list→tree 编译等价性对账测试（列表语义 ≡ 树语义）
- [ ] 本地等价校验全绿（未接远端，CI 待首推验证）
- [ ] plan/00/06 状态回写 + `plan/HANDOFF-M3.md` 落盘并 commit

## 六、关键命令速查

```bash
# 测试（逐文件；新增 tests/*.test.js 后同步追加到 package.json）
npm test

# 自检 / 构建 / 求值 trace
npm run selftest
node tools/atlas.js build data/samples/demo-game.rules.json --case data/samples/demo-game.case.json -o out/demo-game.html
node tools/atlas.js walk data/samples/demo-game.rules.json --case data/samples/demo-game.case.json

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

**续接提示词模板**：`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M2.md" 继续完成 M2 确定性内核`
