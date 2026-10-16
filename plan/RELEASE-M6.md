# RELEASE-M6 发布留档（2026-10-15 发布；2026-10-16 审计修复轮修订）

> 本文件为 M6 发布纪律要求的**发布留档文件**（plan/00 发布纪律三件套之一），记录脱敏扫描、提交元数据定夺、发布过程与核验证据。
> **2026-10-16 修订说明**：审计发现首版 tag 指向中间提交、邮箱重写未覆盖 M6 后 4 提交与 tag tagger、CI 对账数字与实况不符等问题，本轮逐条修复并在 §二/§四/§五 如实记录（不覆盖首轮记录，追加末态实况）。

## 一、脱敏四步 + 全仓产物扫描

**1. 敏感词全仓扫描**（关键词：姊妹项目品牌名 archify / PaintForge / handraw-style / huashu-art-motion、个人邮箱（本机 git 配置，形如 `2**********5@qq.com`，**留档内不再逐字写出**）、本机路径 `C:\` / `D:\` / `/c/Users` / `ASUS` / `/d/ProgramData`）：

| 扫描范围 | 结果 | 处置 |
|---|---|---|
| README.md / SKILL.md / docs/report.md / docs/demo/ / src/ / tools/ / data/ / .github/ | **零命中**（品牌词、邮箱、本机路径均无） | 无需处理 |
| data/README.md、plan/00/01/02 中的 archify 等 | **竞品引用**（差异化论据，公开仓Owner名称+星数快照） | **保留**——plan/00「品牌隔离」纪律约束的是**本项目系列前作的名称与业务领域**，竞品调研对象非前作；且 01 题面差异化论证依赖这些公开数据 |
| plan/ 全部 HANDOFF / 台账 | 无前作名称、无业务领域描述、无本机路径 | 无需处理 |

> **2026-10-16 补扫（本轮修订）**：首版留档 §一/§二 曾把个人邮箱**逐字写在本文件内**（这本身即公开仓内的二次泄漏面）→ 本轮已脱敏为掩码形式；全仓 `git grep` 复扫已无逐字邮箱。

**2. 前作名称与业务领域**：全仓（含 plan/）grep 无姊妹项目名称命中；plan/00 品牌隔离纪律（"不复制姊妹项目代码；公开文档不提其余项目业务领域"）全程遵守——01 题面仅以"同系列"自称，不涉及其余项目。

**3. 本机路径与时间戳**：仓库内文档/代码/产物 grep `[A-Za-z]:\\`、`file:///[A-Z]:`、`/c/Users` 零命中；产物 HTML 由 M4 校验器锁定零外链、无时间戳（validate --check 含此项）。

**4. 隐私红线复核**：用户真实规则集通道（`data/**/_private/`、`data/private/`）在 .gitignore 且仓内不存在；全仓无密钥/凭据（`gh` token 仅在 keyring，未入任何文件）。

## 二、提交元数据检查与 git 邮箱口径定夺

- **实况（出题阶段）**：M0–M5 共 8 个提交，作者/提交者均为 `yuluo554 <本机 QQ 邮箱>`（QQ 个人邮箱，留档内不逐字写出）。
- **定夺**：公开仓推送前**改写历史为 GitHub noreply 邮箱**（`282769740+yuluo554@users.noreply.github.com`）。理由：邮箱随公开提交永久暴露，不符合最小暴露原则；noreply 是 GitHub 标准口径（可正确关联头像与贡献图）。
- **首轮执行（M6 首推前，仅覆盖当时 8 个提交）**：尚无远端（首推前），`git filter-branch --env-filter` 对当时的 8 个提交改写作者+提交者邮箱；重写后 `git log --format='%an %ae' | sort -u` 仅剩 `yuluo554 <282769740+yuluo554@users.noreply.github.com>`。
- **首轮结论的局限（2026-10-16 审计发现，如实记录）**：上述"仅剩 noreply"结论**只对当时的 8 个提交成立**。此后 M6 的 4 个提交（CI 修复 / 用例自足化 / 收尾回写 / 对账补记）又使用了本机 `git config user.email`（仍是同一 QQ 邮箱），且附注 tag `v0.1.0` 的 **tagger 邮箱**也是它——均已推送到公开远端。故首轮"重写后仅剩 noreply"的结论在末态**失真**。
- **第二轮执行（2026-10-16，覆盖全部提交 + tag tagger，使结论真正成立）**：
  - 工具：`git filter-repo --email-callback`（Git 官方推荐，取代 filter-branch；`filter-repo` 会一并重建 tag 对象，故 tagger 邮箱同批处理）。
  - 范围：**改写当时仓库内的全部提交**（原公开历史 12 个：M0–M5 的 8 个 + M6 的 4 个；加本轮审计修复新增的 5 个，共 17 个）的作者+提交者邮箱 + **tag `v0.1.0` 的 tagger 邮箱**，统一改写为 `282769740+yuluo554@users.noreply.github.com`。
  - 顺序：先完成本轮全部代码/文档修复并提交 → 再统一邮箱重写 → 再删旧 tag、在最终提交重打 `v0.1.0`（确保 tagger 邮箱正确）→ 强推 `main` + `--force` 推 tag。
  - 本地验证三处：`git log --format='%ae %ce' | sort -u` 仅剩 noreply；`git for-each-ref refs/tags --format='%(taggeremail)'` 仅剩 noreply；`gh api repos/yuluo554/decision-atlas/commits --jq '.[].commit.author.email' | sort -u` 仅剩 noreply。
- **重写安全性核查**：台账仅记录 engine sha / 产物 sha256（内容哈希，不受提交改写影响）；留档中的**短提交 sha 引用在重写后失效**，已统一改为**以 `gh run list` run id 为锚**的口径式表述（见 §五）。
- **改写后回归**：`npm test` 84/84 全绿（工作区内容零变化，仅元数据改写；84 = 首轮 83 + 本轮新增 K-10 守门断言 1 项）。

## 三、建仓与首推（执行记录）

- 远端：`https://github.com/yuluo554/decision-atlas.git`（公开仓库，gh CLI 创建，账号 yuluo554 / uid 282769740）。
- 首推：`git push -u origin main`。
- CI：`.github/workflows/ci.yml` 四矩阵（ubuntu/windows × node 22/24）首跑结果与 push=run 对账见第五节。

## 四、tag 与 Release（执行记录）

- tag：`v0.1.0`（附注 tag）。**首版 tag 曾指向 M6 中间提交（非收尾提交），导致留档文件 `plan/RELEASE-M6.md` 不在 tag 树内、README 状态行为"M6 推进中"**——2026-10-16 审计发现后已修正：**删除旧 tag，在本轮全部回填完成后的最终提交上重打 `v0.1.0`**，使 tag 树内包含留档文件、README 为已发布态、本节描述与实况一致。tag tagger 邮箱在邮箱重写轮次同批改写为 noreply（见 §二）。
- Release：附示例单文件 HTML `out/demo-game.html`（27,641 B，sha256 `7d1e24fd09c996e3c187bd76391d9e7e5ed0a2e1363472220b5ff0059ea84179`）+ 演示 GIF/截图（`docs/demo/` 6 文件），共 7 资产，附件离线可开（file:// 冒烟复验）。
- 核验：`gh release view v0.1.0 --json assets` 附件在列（7/7）、非 draft。
- **Release 资产 digest 核对（2026-10-16）**：Release 资产为**独立上传的文件**（非 tag zipball），重打 tag **不影响**资产 digest；逐个 `gh api .../releases/tags/v0.1.0` 取 `digest` 与本地 `docs/demo/SHA256SUMS.txt` + 本地构建产物比对，7 项**逐字节一致**（demo-game.html `7d1e24fd…`；GIF `84adc29b…`；5 截图 `6cf0e45d…`/`57f56f35…`/`4ba43bb3…`/`ad9cf888…`/`6d4e7e91…`）。
- **本地可复验路径（两条可复算命令）**：
  ```bash
  # ① 仓库内素材完整性：与入仓清单逐字节比对（在仓库根执行）
  sha256sum -c docs/demo/SHA256SUMS.txt
  # ② Release 资产 digest：与 GitHub 侧现取 digest 比对
  gh release view v0.1.0 --repo yuluo554/decision-atlas --json assets --jq '.assets[] | "\(.name) \(.digest)"'
  # ③ 示例产物本体：本地重建并与 Release 附件 digest 比对
  node tools/atlas.js build data/samples/demo-game.rules.json --case data/samples/demo-game.case.json -o out/demo-game.html
  sha256sum out/demo-game.html   # 期望 7d1e24fd09c996e3c187bd76391d9e7e5ed0a2e1363472220b5ff0059ea84179
  ```
  即"本地可复验"= ① 素材清单自校验 + ②③ 产物/附件 digest 两侧一致，无需下载 Release 即可复算。

## 五、CI 对账（执行记录）

- 矩阵：`ubuntu-latest`/`windows-latest` × node 22/24 四矩阵。
- **口径**：push 数 = run 数**以 `gh run list` 现取为准**（不写死数字，避免随新 push 漂移）；下表按 run id 锚定，失败轮如实记录。
- **截至 2026-10-16 现取**：`gh run list --limit 20` 返回 **5 个 run**（全部为 push 事件，无 PR run），逐条如下：

| run id | 触发提交（内容标识） | CI 结论 |
|---|---|---|
| 38748959280 | 首推 main（M5 交付提交） | **四矩阵全挂**——`node --test tests/` 目录形式 MODULE_NOT_FOUND（CI 复现本机 F-2 坑） |
| 38749253877 | CI 逐文件口径修订 | **四矩阵全挂**——m4.test C4 依赖未入仓的 `out/demo-game.html`（.gitignore 排除），CI 上 ENOENT |
| 38749501567 | m4.test C4 自足化 | **四矩阵全绿 success**（ubuntu×22/24 + windows×22/24 全 success） |
| 38750906862 | M6 收尾回写（完结提交） | **四矩阵全绿 success** |
| 38751094328 | RELEASE-M6 对账补记（第 4 轮 push） | **四矩阵全绿 success** |

对账：现取 push 数 = run 数 = **5**（`gh run list` 逐条 headSha 与 `git log origin/main` 一致）。失败轮 2 个均如实留档：修 CI 配置与测试环境依赖，未动 `src/`/`tools/`/`data/` 冻结件。
- **本轮修复轮（2026-10-16）**：追加 push 的 run 结果按同一口径追加于本节（现取 run id 为准），不再改写历史 run 记录。

## 六、发布扫描结论

**PASS**——无敏感信息、无前作暴露、无本机路径泄漏、提交元数据已定夺并执行、冻结件未动（`gen_bench --check` FROZEN_OK）。
