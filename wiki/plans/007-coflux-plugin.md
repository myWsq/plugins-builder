# Plan 007: coflux plugin — Claude Code 任务状态经 cofluxd 上报

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat ca5324a..HEAD -- catalog plugins docs MARKET_README.md src/build.mjs test/build.test.mjs`

## Status

- Priority: P1
- Effort: S
- Risk: LOW
- Depends on: none
- Category: feature
- Execution: self
- Planned at: `ca5324a`, 2026-08-15

## Requirement

coflux（`/Users/wsq/Workspace/coflux`）是 owner 自维护的 agent 指挥台：本机 daemon 起
PTY 跑 claude/codex，Web 侧栏展示各工作区的回合状态（active / approval / question /
done）。状态的语义信号来自 agent hook 事件：`cofluxd hook claude` 作为信使把 Claude Code
的 hook 事件转发给本机 daemon 的 `POST /hook`。目前这套 hook 配置只以手工形式存在于
owner 的 `~/.claude/settings.json`，指向 dev checkout 路径，无法分发。

做完之后为真：本 marketplace 新增 `coflux` 插件（0.1.0）——

- Claude bundle 携带 `hooks/hooks.json`，把 7 个事件（PreToolUse、PostToolUse、
  PostToolUseFailure、PermissionRequest、Stop、StopFailure、Notification）接到全局安装的
  `cofluxd hook claude`；cofluxd 未安装时每次触发**静默退 0**，绝不干扰 agent、绝不写
  stdout。
- 两个 bundle 都携带一个真实有用的小 skill：介绍 coflux 是什么、本插件的上报机制，以及用
  `cofluxd status / doctor / logs` 排查 daemon 问题。
- catalog、marketplace 清单、marketplace README、`docs/coflux.md` 全部按既有插件惯例补齐，
  `npm run verify` 通过。

相邻的错误解法：命令写死 dev checkout 路径（不可分发）；不加存在守卫的裸
`cofluxd hook claude`（binary 缺失时每个事件在 transcript 报 non-blocking error，已对官方
hooks 文档核实）；为凑 build 约束放一个空占位 skill（违背仓库"不做填充物"原则）。

## Decisions & tradeoffs

- **事件集合与形态：7 个事件、不设 matcher（全匹配）、同步（不加 `async`）**。事件名与
  owner 手工验证过的 `~/.claude/settings.json` 配置一致（该配置有 6 个），另补
  `PostToolUseFailure`（worker 映射消费它，且已核实为真实 Claude Code 事件）。
  Rejected: 加 `"async": true` 省 PreToolUse/Stop 的阻塞开销 —— 与手工验证过的形态不同，
  收益（每次工具调用 ~50-100ms）不值得引入未验证行为；将来可单独验证后再改。
  Rejected: 多挂其他事件 —— worker 名单外事件一律忽略（合法但无语义），只多付进程 spawn。
  Based on: worker 事件映射
  `/Users/wsq/Workspace/coflux/crates/worker/src/hook.rs:53-67`（PreToolUse/PostToolUse/
  PostToolUseFailure→active，PermissionRequest→approval，Stop/StopFailure→done，
  Notification 按 notification_type 分流）。

- **命令带存在守卫**：形如
  `sh -c 'command -v cofluxd >/dev/null 2>&1 && exec cofluxd hook claude || :'`
  （具体写法执行者可微调，契约不可变：cofluxd 缺失时静默退 0；任何分支不写 stdout；
  stdin 原样传给 cofluxd）。
  Rejected: 裸 `cofluxd hook claude` —— 官方文档确认命令不存在按 non-blocking error 处理并
  在 transcript 显示错误提示，每个事件都刷一次。
  Based on: 信使自身纪律（任何失败静默退 0、绝不写 stdout，
  `/Users/wsq/Workspace/coflux/packages/cli/cofluxd.mjs:667-760`），守卫是同一纪律在
  binary 缺失场景的延伸。

- **附带一个真实的小 skill，而非改 builder**。builder 强制每插件必有 `skills/` 且双
  target；codex bundle 拿不到 hooks，skill 让它不是空壳。
  Rejected: 放宽 `src/build.mjs` 的 skills/ 与双 target invariant 发 claude-only 纯 hooks
  插件 —— 一次性结构成本高，departure check 已选附带 skill。
  Rejected: 空占位 skill —— 违背仓库原则。
  Based on: `src/build.mjs:387`（skills/ 必须存在）、`build.mjs:89-90`（双 target category
  必填）、`build.mjs:444-445`（hooks/ 只拷进 claude bundle）。

- **catalog 条目照 `catalog/plugins/subagent-model.json` 模板**：version `0.1.0`，
  capabilities 含 `Skills` 与 `Hooks`，targets.claude.category `development`，
  targets.codex.category `Developer Tools`，codex policy
  `{installation: AVAILABLE, authentication: ON_INSTALL}`。
  Based on: 全部 4 个现有条目共用同一 policy 与 category 组合（`catalog/plugins/*.json`）；
  必填字段清单见 `src/build.mjs:77-130` `validatePluginDescriptor`。

- **分发面三处同步**：`catalog/marketplace.json` 的 plugins 数组、`MARKET_README.md` 的
  插件列表行、`docs/coflux.md`（照 `docs/subagent-model.md` 体例）。
  Based on: `MARKET_README.md:6-10` 逐插件列行；`docs/` 与 MARKET_README 原样拷贝进
  marketplace 根、不进 bundle（README.md「Source layout」）。

- **迁移注记写进 `docs/coflux.md`**：装插件后需手动删除 `~/.claude/settings.json` 里的同款
  手工 hooks，否则每事件双重上报（两次 node spawn + 两次 POST；状态合并无害但纯浪费）。
  本仓库不改任何用户侧文件。

- **(decided while planning) 不动 `package.json` 版本、不新增测试**。发版走 `vX.Y.Z` tag
  流程且 push 不在本次授权内；build 测试是通用的，新插件不需要专属测试，但既有套件必须
  全绿。

## Direction

新增插件完全是数据性改动：`plugins/coflux/`（hooks + skill 源）+ `catalog/plugins/
coflux.json` + 三处分发面。不触碰 `src/`、`test/`。skill 放
`plugins/coflux/skills/coflux/SKILL.md`，frontmatter 与正文体例照
`plugins/subagent-model/skills/subagent-model/SKILL.md`；内容三段：coflux 是什么（一段）、
本插件的上报机制与隐私边界（只出事件名/通知类型/会话 id/pid，不出 prompt 与回答原文）、
`cofluxd` 排查手册（status / doctor / logs -f / up；`restart` 标注"会结束本机所有活会话"
的警示）。skill 无 target 差异，不用 `<!-- claude -->`/`<!-- codex -->` 块。

### Milestone 1: 插件源与分发面齐备

`plugins/coflux/hooks/hooks.json`、`plugins/coflux/skills/coflux/SKILL.md`、
`catalog/plugins/coflux.json`、`catalog/marketplace.json`、`MARKET_README.md`、
`docs/coflux.md` 全部就位。Validation: `npm test` → exit 0。

### Milestone 2: build 产物形状正确

`npm run build` 通过；`dist/claude-plugins/coflux/hooks/hooks.json` 存在且含 7 个事件、
命令带守卫；`dist/plugins/coflux/`（codex bundle）含 skills、**不含** hooks 目录。
Validation: `npm run build` → exit 0，随后
`ls dist/claude-plugins/coflux/hooks/hooks.json && test ! -e dist/plugins/coflux/hooks` →
exit 0。

## Landmines

- `validatePluginDescriptor` 的必填面比 subagent-model 直觉更大：`shortDescription`、
  `longDescription`、`defaultPrompt`（必须是数组，≤3 条、每条 ≤128 字符）都是硬性的，缺
  一个 build 即 fail（`src/build.mjs:77-130`）。
- hooks.json 在 build 期只做 JSON 合法性校验（`src/build.mjs:387-389`），事件名拼错不会
  被 build 抓住、只会在运行期静默不触发——事件名逐字照抄本计划 Requirement 里的 7 个。
- PermissionRequest 事件的 hook 若写 stdout 会被当决策 JSON 解析；守卫命令的所有分支
  （含 `||` 兜底）都不得产生 stdout。
- `test/build.test.mjs:263-278` 对 subagent-model 的 hooks 拷贝行为有专项断言；新增 coflux
  不应影响它们，若测试失败先查自己的改动而非改测试。
- worker 对上报 pid 做进程树反查，要求信使进程在响应前存活（`cofluxd.mjs` 注释的契约）；
  守卫用 `exec` 换掉 sh 进程即可，不要在 cofluxd 外再包后台化/detach。

## Scope

In scope:

- `plugins/coflux/**`
- `catalog/plugins/coflux.json`
- `catalog/marketplace.json`
- `docs/coflux.md`
- `MARKET_README.md`
- `wiki/plans/**`

Out of scope:

- `src/**`、`test/**` —— builder 与测试不改（本插件完全落在现有 schema 内）
- `package.json` 版本与发版 tag —— push/发版不在授权内
- `~/.claude/settings.json` —— 用户侧手工 hooks 的清理只写文档，不代改
- `/Users/wsq/Workspace/coflux/**` —— coflux 仓库本体（信使与 worker 已实现，无需改动）

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Unit tests | `npm test` | exit 0 |
| Build | `npm run build` | exit 0 |
| Verify（tests + 真实 catalog build） | `npm run verify` | exit 0 |

## Done criteria

- [ ] All listed commands pass.
- [ ] `dist/claude-plugins/coflux/hooks/hooks.json` 存在，含且仅含 7 个既定事件，命令带
      存在守卫且无 stdout 分支。
- [ ] `dist/plugins/coflux/` 含 skills、不含 hooks 目录。
- [ ] `docs/coflux.md` 含手工 hooks 迁移注记；`MARKET_README.md` 与
      `catalog/marketplace.json` 列出 coflux。
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.
- A named assumption is false.

## Maintenance notes

- 事件集合与 worker 映射（coflux 仓库 `crates/worker/src/hook.rs`）是跨仓库契约：coflux 侧
  增删状态语义时，这里的 hooks.json 要同步版本升级；worker 对名单外事件宽容（忽略而非
  拒绝），所以先升插件后升 daemon 也安全。
- codex 侧上报（`cofluxd hook codex`，notify 形态）是已知后续片：builder 目前不支持向
  codex bundle 发 hook/notify 配置，做那一片时先解决 builder 的表达能力。
- hooks 的同步形态每次工具调用多付一次 node 启动 + 本机 POST（~50-100ms）；若将来验证
  `"async": true` 不破坏 pid 反查契约，可整体切 async 并 bump 版本。
