# HANDOFF-M6（→ M6 发布：GitHub 公开仓库 + Release + 发布留档）

> **用法**：新对话以 `/goal 读取 "<项目绝对路径>\plan\HANDOFF-M6.md" 继续完成任务` 启动（绝对路径只出现在用户侧启动命令，本文件内一律相对路径）。
> **项目根**：仓库根（本文件所在 `plan/` 的上一级）。

---

## 一、当前进度 + 证据（M0–M5 已完成，2026-10-15）

**M0 = 计划先行 + 骨架；M1 = 数据先行；M2 = 确定性内核；M3 = 渲染完成；M4 = 校验与基准完成；M5 = 交付三件套完成**（M0–M4 详见 HANDOFF-M1/M2/M3/M4/M5 归档）。M5 交付实测：

| 项 | 证据 |
|---|---|
| `SKILL.md` 主入口 | §11 大纲六节（触发词/输入契约+错误码表+退出码三语义/七条命令/边界/自定义指引/全流程演练）；**子代理无先验演练 PASS**（7 命令全过 + 6 项红向验证吻合 + headless 只读确认内嵌 JSON 与零外链）；演练反馈已回写（bisect SKIP 说明） |
| `docs/report.md` | 技术报告十节（求值语义/确定性布局/可证伪设计/覆盖率三值逻辑/校验器与基准末态/渲染交互/G1–G6/边界与扩展/复现命令索引）；断言均附复现命令，无无法复现的断言 |
| README 正式版 | 顶部 GIF + 5 分镜截图 + bench/validate 终端截图 + 快速开始（补 bisect）+ 指标表（M4 末态不变）+ 限制节六条 + 里程碑表 M5 ✅ |
| `docs/demo/` | 5 截图 + demo.gif + `SHA256SUMS.txt`；headless Edge 程序化驱动产物 HTML（注入脚本只调页面自身 renderTrace/renderCounterfactual，交互层零判定逻辑不破）；GIF ffmpeg 合成（统一调色板 + bayer 无随机抖动）；**两次生成 sha256 逐个一致** |
| 干净环境演练 | `git clone` 全新目录 8 条命令（selftest/build/walk/bisect/validate --check/bench/npm test/gen_bench --check）**全部 exit 0 一次跑通**；83/83 全绿；留档摘要入 plan/06 M5 节 |
| 台账回写 | plan/00（决策记录 +1 条：M5 素材可复现口径；承诺表"示例 HTML"🟡 M5；里程碑表 M5 ✅）、plan/06（M5 节标题 ✅ + 完成实测 6 条）、plan/07（提交材料对照表 1/2/3/4/5/6 全 ✅，7 🟡 待 M6） |

## 二、下一棒待办（M6 发布）

按 `plan/06-里程碑详表.md` M6 节 + `plan/00` 发布纪律（DoD 必须显式含 ①git tag ②GitHub Release 附产物 ③发布留档文件）执行：

1. **脱敏四步**（见 plan/00 品牌隔离与脱敏纪律）+ 全仓产物扫描（外链/敏感词/路径）+ 提交元数据检查（git 邮箱口径定夺）→ 留档 `plan/RELEASE-M6.md`；
2. **建远端 + 首推**：GitHub 公开仓库 `yuluo554/decision-atlas`；CI 首跑四矩阵（ubuntu/windows × node 22/24，`.github/workflows/ci.yml` 已 M0 预置，按实跑修订）全绿并**按提交逐条对账**（push 数 = run 数）；失败轮如实留档；
3. **git tag**（`v0.1.0`）+ **GitHub Release**（附示例单文件 HTML `out/demo-game.html` + 演示 GIF/截图）；`gh release view --json assets` 核验（非 draft、附件在列）；
4. **全新 clone 复核**：无需 npm install、按 README 逐条跑通、Release 附件下载可离线打开（file:// + headless 冒烟）；
5. **检索式复跑 + 星数快照更新**（data 台账"待核对项"闭环：8 条检索式 + 竞品星数基准日快照更新）；
6. **收尾**：`npm test` 全绿 → plan/00/06/07 回写（M6 ✅ + 承诺表全勾）→ 项目完结声明（或 HANDOFF-M7 若有后续）→ commit。

**M6 明确不做**：`src/`、`tools/`、`data/` 功能代码与冻结数据零改动（83 项测试锁定）；如 CI 暴露环境性问题，修 CI 配置（workflow 文件），不动内核。

## 三、既定口径清单（K 编号，动了会打挂测试）

与 HANDOFF-M5 第三节**完全一致**（K-1~K-18，此处不重复；读 M5 交接第三节或 plan/00 决策记录）。M6 特别注意：

| # | 口径 | M6 提示 |
|---|---|---|
| K-9 | CI 类 DoD 措辞："本地等价校验（CI 待首推验证）"——**M6 首推后**把 README/report/plan 内该措辞按实跑结果更新 | 首推全绿后逐处替换，并留 diff 痕迹 |
| K-12 | benchmark 冻结件禁手改 | 发布扫描时**不得**以任何理由重写 `data/benchmark/`；`gen_bench --check` 必须保持 FROZEN_OK |
| K-13 | gen_bench/validate/bench 入口守卫 | 发布前 import 冒烟已含在 npm test，无需额外动作 |
| K-4/G4 | 确定性禁令 | Release 附件必须是确定性构建产物（同输入 sha256 一致，干净 clone 可复核） |
| K-1 | 退出码三语义 | 全新 clone 复核时按 README"退出码约定"逐条核对 |

## 四、本机环境坑（全部实测）

1. `node --test tests/`（目录参数）在 Git Bash + Node v24 下 MODULE_NOT_FOUND → package.json 已逐文件列至 m4.test.js；**M6 新增测试文件记得追加**（若无新增则不用动）。
2. 本机 `core.autocrlf=true`：新文件靠 Write 工具 LF + `.gitattributes` 兜底；hygiene 扫全仓 CR；**脱敏改文件后重跑 `npm test`**。
3. Edge 路径：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（x86 目录）；headless 先删旧 PNG、`--screenshot="D:\\…"` 双反斜杠、`--virtual-time-budget=3000` 驱动延迟后截图。
4. 临时脚本放 `.tmp/`（已 gitignore，用完删）并落 `.mjs`；`mkdir -p .tmp` 先行。
5. 无 Python 依赖（纯 JS 项目）；**ffmpeg 本机可用**（winget 安装，M5 演示 GIF 已用；M6 Release 视频类素材可复用）。
6. genbench 守门测试含红向用例：失败输出见 `CHECK_FAIL` 先查恢复逻辑 finally。
7. `src/`、`tools/`、`src/layout.js`/`render.js`/`coverage.js`、`tools/validate.js`/`bench.js` 全部冻结（83 项测试锁定）；M6 演示复现直接 `node tools/atlas.js build …` + headless Edge；bench 报告截图可用 `node tools/bench.js` 终端输出或 `--json` 产物。
8. 改 manifest 必须走生成器（直接手改被 `--check` 与 bench 锚定双重拦截）。
9. m4.test D3 探活 48 组 spawnSync 约 5 秒；全量 `npm test` 约 7–10 秒，勿误判挂死。
10. 本仓库**无远端**（M6 才建仓首推）；`gh` CLI 可用性 M6 首日先探（`gh auth status`），不可用则网页流程 + 留档。
11. M5 演示素材生成脚本在 `.tmp/driver.mjs` 与 `.tmp/assemble.mjs`（已用毕，`.tmp` 不入仓；如需重生成素材，plan/06 M5 节完成实测第 4 条记录了方法）。

## 五、DoD 逐项 checklist（M6，来自 plan/06 + 00 发布纪律）

- [ ] 脱敏四步 + 产物扫描 + 提交元数据检查留档（含 git 邮箱口径定夺）→ `plan/RELEASE-M6.md`；
- [ ] GitHub 公开仓库建立 + 首推；CI 首跑四矩阵全绿 + push=run 对账（失败轮如实留档）；
- [ ] `git tag`（v0.1.0 类）+ GitHub Release 附示例 HTML + 演示图；`gh release view --json assets` 核验；
- [ ] 全新 clone 复核：无需 npm install、按 README 跑通、Release 附件下载可开；
- [ ] 检索式复跑 + 星数快照更新（data 台账待核对项闭环）；
- [ ] `npm test` 全绿 + plan/00/06/07 回写 + 完结声明 + commit。

## 六、关键命令速查

```bash
# 测试（逐文件；M6 若新增 tests/*.test.js 同步追加 package.json）
npm test

# 自检 / 构建 / 校验 / 基准
npm run selftest
node tools/atlas.js build data/samples/demo-game.rules.json --case data/samples/demo-game.case.json -o out/demo-game.html
node tools/validate.js data/samples/demo-game.rules.json out/demo-game.html --check
node tools/bench.js
node tools/gen_bench.js --check    # FROZEN_OK / CHECK_FAIL

# 发布相关（M6）
gh auth status                      # 先探可用性
git remote add origin https://github.com/yuluo554/decision-atlas.git
git push -u origin main
gh release create v0.1.0 out/demo-game.html docs/demo/demo.gif --title "v0.1.0" --notes "…"
gh release view --json assets

# headless 冒烟（Edge 在 x86 目录；先删旧截图）
rm -f out/demo-shot.png
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless --disable-gpu \
  --window-size=1400,1000 --screenshot="D:\\…\\out\\demo-shot.png" "file:///…/out/demo-game.html"

# git（当前无远端）
git status && git log --oneline | head -5
```

**续接提示词模板**：`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M6.md" 继续完成 M6 发布（GitHub 公开仓库 + Release + 发布留档）`
