# RELEASE-M7 发布留档（v0.1.1，2026-10-20）

> 本文件为 M7 迭代（运行时声明与 CI 对齐 + actions 升级）的发布留档，沿用 `plan/RELEASE-M6.md` 的留档口径。
> **相对 v0.1.0 的实质变化**：`engines.node` `>=20` → `>=22`、CI actions `v4` → `v7` + `permissions` + `concurrency`。
> **产物与演示素材零变化**：`demo-game.html` 与 7 个 Release 附件**逐字节同 v0.1.0**（sha256 全部一致）。

## 一、本轮改了什么（8 个文件，20 增 / 11 删）

| 文件 | 改动 |
|---|---|
| `package.json` | `engines.node`: `>=20` → `>=22`；`version`: `0.1.0` → `0.1.1` |
| `README.md` | 快速开始「Node ≥ 20」→「Node ≥ 22」；状态行与路线图补 M7 |
| `SKILL.md` | 两处运行时前置 `Node ≥ 20` / `>= 20` → `>= 22` |
| `docs/report.md` | 工程承诺第 3 条 `Node ≥ 20` → `≥ 22` |
| `.github/workflows/ci.yml` | `actions/checkout@v4`→`@v7`、`actions/setup-node@v4`→`@v7`；新增 `permissions: contents: read`；新增 `concurrency`（同 ref cancel-in-progress）；**矩阵 `[22, 24] × [ubuntu-latest, windows-latest]` 与测试清单行不动** |
| `plan/00-README总览.md` | M0 技术选型行：现行底线写 22，标注 2026-10-20 抬高的日期与原因 |
| `plan/03-架构与技术选型.md` | §一 决策表第 1 行、§六 环境与兼容：同步到 ≥ 22 |
| `plan/07-交付对标与决策记录.md` | D-01：`Node ≥22` + 标注修订原因（EOL / 从未被 CI 覆盖）；「统一 JS」结论不变 |

**决策依据**（用户拍板）：
- **DEC1 = B**：抬到 `>=22`，矩阵保持 `[22, 24]`——两档都落在声明范围内，声明与实测完全对齐。理由：Node 20 已于 **2026-04-30** 结束 maintenance（EOL），且**从未被 CI 验证**（矩阵只有 22/24）。
- **DEC3 = A**：Release 附件保持 7 个演示物料形态，不补源码 zip（README 快速开始是 `git clone`，未承诺源码包）。
- **产物版本标签 = A**：`src/render.js:189` 的 footer 是构建期**硬编码** `v0.1.0`，本轮**不动** `src/`——因此 v0.1.1 的 `demo-game.html` 与 v0.1.0 附件**逐字节相同**，演示截图无需重做。footer 的版本标签不随 tag 变化属已知形态，不是缺陷（产物契约锁定、无时间戳、确定性可复现优先）。

## 二、验证证据

### 改前基线 ↔ 改后（三次复跑一致）

| 项 | 命令 | 结果 | 退出码 |
|---|---|---|---|
| 测试 | `npm test` | `ℹ tests 84` / `ℹ pass 84` / `ℹ fail 0` | **0** |
| selftest | `node tools/atlas.js selftest` | `SELFTEST_OK` | **0** |
| — engine 指纹 | 同上 | `engine sha256 = 01fb56fb199c5b4387d93430acd3ae38a0b060cf6bdb5fc36f62282b3037aba8`（**未变**） | — |
| — html 指纹 | 同上 | `html   sha256 = 7d1e24fd09c996e3c187bd76391d9e7e5ed0a2e1363472220b5ff0059ea84179`（**未变**） | — |
| 基准 | `node tools/bench.js` | `BENCH_OK 12 suites`（12 套件逐行全 1.000） | **0** |
| 冻结件 | `node tools/gen_bench.js --check` | `FROZEN_OK 25 files` | **0** |
| 产物校验 | `build` → `validate.js --check` | `VALIDATE_OK …（含 --check 字节比对）` | **0** |
| 素材清单 | `sha256sum -c docs/demo/SHA256SUMS.txt` | 6 项全 `OK` | **0** |
| 附件复现 | `build … -o out/demo-game.html` | `7d1e24fd09c996e3c187bd76391d9e7e5ed0a2e1363472220b5ff0059ea84179`（27,641 B）= Release digest | **0** |

### CI（推送 `568242e` 后实测）

- run id **39310565422**，conclusion **success**。
- check-runs **4/4 success**：`test (ubuntu-latest, 22)` / `(ubuntu-latest, 24)` / `(windows-latest, 22)` / `(windows-latest, 24)`。
- `Node.js 20 is deprecated` 注解 **0 条**（改前 run 38885540831 有该注解）。
- 剩余 2 条注解是 runner-image 提示 `The ubuntu-latest label will migrate to Ubuntu 26 beginning October 19, 2026`（D4，本轮按诊断口径**不处理**：本仓零依赖纯 JS，迁移风险低；不在本轮范围）。

### actions 版本核实（本轮 GitHub API 实测，非照抄）

| action | 实测 | 工作流引用 |
|---|---|---|
| `actions/checkout` | `releases/latest` = **v7.0.1**；`git/ref/tags/v7` = `3d3c42e5aac5ba805825da76410c181273ba90b1` | `@v7` |
| `actions/setup-node` | `releases/latest` = **v7.1.0**；`git/ref/tags/v7` = `949feb2413d6458794dcd2491c4babbbce0c15c1` | `@v7` |

> 注：本仓用 `actions/setup-node`（不是 `setup-python`），版本口径不跨仓照搬。

## 三、脱敏复核

- 全程未写个人邮箱；提交与 tag 身份为 `yuluo554 <282769740+yuluo554@users.noreply.github.com>`（`git log --format='%an <%ae> | %cn <%ce>' | sort -u` 单条）。
- `update/` 目录含本机绝对路径，**未入仓**（`.gitignore` 未覆盖，靠不 `git add` 保证；`git status` 可见 `?? update/`）。
- 本轮未新增任何产物内含本机路径/时间戳（`validate --check` 的时间戳与零外链断言通过）。

## 四、tag 与 Release（执行记录）

- 版本：`package.json` `0.1.1`；tag `v0.1.1`（附注 tag，指向发布提交）。
- Release：复用 v0.1.0 的 7 个附件（逐字节相同），正文更新为 84 项 + Node ≥22 + actions v7。
- **v0.1.0 保留不动**（tag、Release、7 个附件全部保持原样）。

### 本地可复验路径

```bash
git clone https://github.com/yuluo554/decision-atlas.git
cd decision-atlas

npm test                            # 零依赖，无需 install：84 passed / 0 failed，exit 0
node tools/atlas.js selftest        # SELFTEST_OK + 两个 sha256（见上表）
node tools/gen_bench.js --check     # FROZEN_OK 25 files

# 素材完整性（在仓库根执行）
sha256sum -c docs/demo/SHA256SUMS.txt

# 产物与 Release 附件对撞
node tools/atlas.js build data/samples/demo-game.rules.json \
  --case data/samples/demo-game.case.json -o out/demo-game.html
sha256sum out/demo-game.html        # 期望 7d1e24fd09c996e3c187bd76391d9e7e5ed0a2e1363472220b5ff0059ea84179
gh release view v0.1.1 --repo yuluo554/decision-atlas --json assets | jq '.assets[] | "\(.name) \(.digest)"'
```

## 五、纪律自检

| 条款 | 状态 |
|---|---|
| 未改 `src/**` / `tools/**` / `tests/**` | **遵守**：两个确定性指纹逐字符未变；测试仍 84/84 |
| 未改 `data/benchmark/**` 与 `thresholds` | **遵守**：`FROZEN_OK 25 files` |
| 未改 `docs/demo/**` | **遵守**：`sha256sum -c` 6/6 OK |
| 未放宽门禁口径 | **遵守**：所有断言原样 |
| 未改退出码约定（0/1/2） | **遵守**：CI 里的退出码语义冒烟步骤未动 |
| 未补 `main`/`files`/`dependencies` | **遵守**：`"private": true` 不发 npm |
| `update/` 未入仓 | **遵守** |
| 未 `npm install` | **遵守**：仓库内无 `node_modules` |

## 六、未做 / 未验证

| 项 | 状态 | 说明 |
|---|---|---|
| `ubuntu-latest` 迁移 Ubuntu 26（D4） | **不处理** | 诊断已定「风险低、不列入迭代动作」；2 条 notice 注解保留 |
| 产物 footer 版本标签 | **保持 `v0.1.0`** | 硬编码于 `src/render.js:189`，改动会破坏 `html sha256` 契约；按用户拍板 A 不动 |
| 补源码 zip（DEC3=B） | **不做** | 用户拍板 A 保持现状 |
