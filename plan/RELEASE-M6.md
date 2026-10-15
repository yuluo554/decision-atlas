# RELEASE-M6 发布留档（2026-10-15）

> 本文件为 M6 发布纪律要求的**发布留档文件**（plan/00 发布纪律三件套之一），记录脱敏扫描、提交元数据定夺、发布过程与核验证据。

## 一、脱敏四步 + 全仓产物扫描

**1. 敏感词全仓扫描**（关键词：姊妹项目品牌名 archify / PaintForge / handraw-style / huashu-art-motion、个人邮箱 [已脱敏邮箱]、本机路径 `C:\` / `D:\` / `/c/Users` / `ASUS` / `/d/ProgramData`）：

| 扫描范围 | 结果 | 处置 |
|---|---|---|
| README.md / SKILL.md / docs/report.md / docs/demo/ / src/ / tools/ / data/ / .github/ | **零命中**（品牌词、邮箱、本机路径均无） | 无需处理 |
| data/README.md、plan/00/01/02 中的 archify 等 | **竞品引用**（差异化论据，公开仓Owner名称+星数快照） | **保留**——plan/00「品牌隔离」纪律约束的是**本项目系列前作的名称与业务领域**，竞品调研对象非前作；且 01 题面差异化论证依赖这些公开数据 |
| plan/ 全部 HANDOFF / 台账 | 无前作名称、无业务领域描述、无本机路径 | 无需处理 |

**2. 前作名称与业务领域**：全仓（含 plan/）grep 无姊妹项目名称命中；plan/00 品牌隔离纪律（"不复制姊妹项目代码；公开文档不提其余项目业务领域"）全程遵守——01 题面仅以"同系列"自称，不涉及其余项目。

**3. 本机路径与时间戳**：仓库内文档/代码/产物 grep `[A-Za-z]:\\`、`file:///[A-Z]:`、`/c/Users` 零命中；产物 HTML 由 M4 校验器锁定零外链、无时间戳（validate --check 含此项）。

**4. 隐私红线复核**：用户真实规则集通道（`data/**/_private/`、`data/private/`）在 .gitignore 且仓内不存在；全仓无密钥/凭据（`gh` token 仅在 keyring，未入任何文件）。

## 二、提交元数据检查与 git 邮箱口径定夺

- **实况**：M0–M5 共 8 个提交，作者/提交者均为 `yuluo554 <[已脱敏邮箱]>`（QQ 个人邮箱）。
- **定夺**：公开仓推送前**改写历史为 GitHub noreply 邮箱**（`282769740+yuluo554@users.noreply.github.com`）。理由：邮箱随公开提交永久暴露，不符合最小暴露原则；noreply 是 GitHub 标准口径（可正确关联头像与贡献图）。
- **执行**：尚无远端（首推前），`git filter-branch --env-filter` 对全部 8 个提交改写作者+提交者邮箱；重写后 `git log --format='%an %ae' | sort -u` 仅剩 `yuluo554 <282769740+yuluo554@users.noreply.github.com>`。
- **重写安全性核查**：台账仅记录 engine sha / 产物 sha256（内容哈希，不受提交改写影响），未记录任何 git 提交哈希 → 改写不破坏任何留档引用。
- **改写后回归**：`npm test` 83/83 全绿（工作区内容零变化，仅元数据改写）。

## 三、建仓与首推（执行记录）

- 远端：`https://github.com/yuluo554/decision-atlas.git`（公开仓库，gh CLI 创建，账号 yuluo554 / uid 282769740）。
- 首推：`git push -u origin main`。
- CI：`.github/workflows/ci.yml` 四矩阵（ubuntu/windows × node 22/24）首跑结果与 push=run 对账见第五节。

## 四、tag 与 Release（执行记录）

- tag：`v0.1.0`（附注 tag，指向 M6 收尾提交）。
- Release：附示例单文件 HTML `out/demo-game.html` + 演示 GIF/截图（`docs/demo/`），附件离线可开（file:// 冒烟复验）。
- 核验：`gh release view --json assets` 附件在列、非 draft。

## 五、CI 首跑对账（执行记录）

- 矩阵 4/4 全绿；push 数 = run 数逐条对账；失败轮（如有）如实记录于下表。

| push | commit | CI 结论 |
|---|---|---|
| 1（首推，重写历史后的 8 提交 main） | 7c97b57 | **四矩阵全挂**——`node --test tests/` 目录形式 MODULE_NOT_FOUND（CI 复现本机 F-2 坑；日志留 GitHub run 38748959280） |
| 2（CI 修复） | 2dc9cde | **四矩阵全挂**——m4.test C4 依赖未入仓的 `out/demo-game.html`（.gitignore 排除），CI 上 ENOENT（run 38749253877） |
| 3（C4 自足化） | 94cb567 | **四矩阵全绿 success**（run 38749501567：ubuntu-latest×22/24 + windows-latest×22/24 全 success） |

对账：push 数 3 = run 数 3（`gh run list` 逐条 headSha 与 `git log origin/main` 一致）。失败轮 2 个均如实留档：修 CI 配置与测试环境依赖，未动 `src/`/`tools/`/`data/` 冻结件。

## 六、发布扫描结论

**PASS**——无敏感信息、无前作暴露、无本机路径泄漏、提交元数据已定夺并执行、冻结件未动（`gen_bench --check` FROZEN_OK）。
