# Plan 002: commit 插件 —— 用宿主最便宜模型委派提交/推送

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `plans/README.md`.
>
> Drift check: `git diff --stat 997d513..HEAD -- plugins/commit catalog test/build.test.mjs src/build.mjs`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: feature
- Execution: subagent
- Planned at: `997d513`, 2026-07-23

## Requirement

commit/push 是低难度高频操作，不应消耗会话主模型（最贵档）的 token。新增一个
`commit` 插件，提供一个 commit skill：当用户要求提交或推送代码时，宿主的主模型
把整个提交流程委派给一个用**宿主可用最便宜模型**运行的子代理执行；主模型只负责
一次委派调用和转述结果。

完成后为真：marketplace 含 `dev` 与 `commit` 两个插件；`commit` 插件只含 skills
（无 mcp、无 agents）；`npm run verify` 通过；构建产物中 Claude 与 Codex 两个
bundle 都含 `commit` 插件及其渲染后的 SKILL.md。

正确/错误解的分界：skill 的核心是**委派指令**——主模型被明确指示"不得自己执行
git 命令，必须派子代理"。一个只描述 conventional commits 流程、由主模型自己执行
的 skill 是相邻的错误解，即使它能正常提交。

## Decisions & tradeoffs

- **组件形态**: skills-only 插件，不扩展构建器。Rejected: 给构建器加 `agents/`
  目录支持并发布带 `model: haiku` frontmatter 的自定义 agent —— 构建器
  （`src/build.mjs:386`）仅支持 `skills/`（+ `fragments/`、`mcp/`），扩展它是本
  需求不必要的结构成本；Claude Code 的 Agent (Task) tool 自带 `model` 参数，skill
  文本即可指定廉价模型委派。
- **委派机制用能力探测，不按平台硬编码**: 共享文本写"宿主具备子代理生成工具时必
  须委派，用宿主可用的最便宜模型；无该能力时降级为内联执行"。target block 仅用于
  点名各平台机制与模型：Claude 块点名 Agent/Task tool 且模型指定 `haiku`；Codex
  块点名实验性 collab 的 `spawn_agent`（beta，默认关闭，只能同 provider 换模型），
  并说明未开启 collab 时走内联降级。Rejected: Codex 侧固定内联执行 —— 用户明确否
  决；Codex 已有带 model override 的 spawn_agent，硬编码内联会在该功能转正后白白
  失效。
- **委派 prompt 必须附主会话意图摘要**: skill 须指示主模型在委派 prompt 中用一两
  句话写明本次改动的意图（"为什么改"），并要求子代理将其融入 commit message。
  Rejected: 只传 diff —— 子代理无会话上下文，消息质量退化为纯 diff 反推，这是
  廉价模型方案已知的主要质量风险，摘要是其唯一弥补手段。
- **提交流程安全规则**（skill 共享文本必须包含，缺一即偏离）:
  禁止 `git commit --no-verify` / `git push --force`；提交前检查暂存内容不含
  秘密（.env、密钥类文件）；push 仅在用户显式要求时执行，默认只 commit；不
  `git add -A` 无关文件——只暂存与本次意图相关的改动。
- **catalog 注册顺序**: `commit` 追加在 `catalog/marketplace.json` 的 plugins 数
  组末尾（`dev` 之后）。Rejected: 插入队首或按字母排序 —— 构建产物插件顺序即
  catalog 数组顺序（`src/build.mjs:380`），`test/build.test.mjs:101-103` 断言
  `plugins[0]` 是 dev，追加末尾可保持现有测试不动。
- **commit.json 字段以校验器为准**: 必填 name/version（严格 semver，取
  `0.1.0`）/displayName/description/shortDescription/longDescription/
  author.name/capabilities（非空）/defaultPrompt（数组，≤3 条，每条 ≤128 字
  符）/targets.claude.category/targets.codex.category + policy（installation、
  authentication 枚举参照 dev.json 取 `AVAILABLE` 与合法枚举值；本插件无需认
  证，authentication 选枚举中表示无需认证的值，若枚举不含此类值则沿用
  dev.json 的写法）。不写 `origin` 字段（构建器不校验，它是外部源同步的溯源
  元数据，本插件源即本仓库）。不写 `mcpServers`。
  Based on: `src/build.mjs:76-131`（validatePluginDescriptor）、
  `catalog/plugins/dev.json`。
- **测试增量 (decided while planning)**: 在 `test/build.test.mjs` 增加最小断言：
  两个 target 的 marketplace 输出都含 name 为 `commit` 的条目，且两个 bundle 的
  `skills/commit/SKILL.md` 存在、其 Claude 渲染不含 codex block 内容（复用现有
  target 渲染测试的手法，见 `test/build.test.mjs:117-135` 与 205-227 附近的既有
  模式）。Rejected: 不加测试 —— 现有测试全部围绕 dev，第二个插件是新的构建路径
  分支（无 mcp 的插件此前从未真实构建过），需要一个回归锚点。

## Direction

### Milestone 1: commit 插件源与 catalog 注册

`plugins/commit/skills/commit/SKILL.md` 存在：frontmatter 含 `name: commit` 与长
description（描述触发场景：用户要求 commit/提交/push 代码时，参照
`plugins/dev/skills/dev-explore/SKILL.md:1-4` 的密度）；正文为共享委派流程 + 平台
target block（语法参照 `plugins/dev/skills/dev-explore/SKILL.md:10-12`，指令必须
独占一行）。`catalog/plugins/commit.json` 通过校验，`catalog/marketplace.json`
plugins 数组为 `["dev", "commit"]`。

Validation: `npm run build` -> exit 0，且 `dist/` 下 claude-plugins/commit 与
plugins/commit 均含 skills/commit/SKILL.md。

### Milestone 2: 测试锚点

`test/build.test.mjs` 含 commit 插件的构建断言（marketplace 条目 + 双 bundle
SKILL.md + target 渲染）。

Validation: `npm test` -> exit 0。

## Landmines

- `test/build.test.mjs:101-103` 断言 `plugins[0].source` 指向 dev —— catalog 注册
  顺序放错即挂，见 Decisions。
- target block 指令必须独占一行，否则构建器直接报错
  （`src/build.mjs` renderTargetMarkdown 的 invariant："directives must occupy
  their own line"）。块不可嵌套、必须闭合。
- `defaultPrompt` 每条超过 128 字符会使构建失败（`src/build.mjs:94-96`），写
  commit.json 时注意。
- 无 mcp 的插件不得写 `mcpServers` 键为空对象 —— 校验要求该键存在即非空
  （`src/build.mjs:98-106`），直接省略该键。

## Scope

In scope:

- `plugins/commit/`（新目录）
- `catalog/plugins/commit.json`（新文件）
- `catalog/marketplace.json`（仅 plugins 数组追加）
- `test/build.test.mjs`（仅新增断言）
- `plans/README.md`（状态更新）

Out of scope:

- `src/build.mjs` 及其它 `src/` 文件 —— 方案的前提就是不改构建器；需要改即触发
  STOP。
- `plugins/dev/` —— commit 是独立插件，不动 dev。
- `MARKET_README.md`、`docs/` —— 营销文案另行处理，不阻塞发布。
- 版本号/发布流程（check-release、tag）—— 本 plan 只到 verify 通过为止。
- push/PR 操作 —— 不在授权范围。

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Unit tests | `npm test` | exit 0 |
| Full verify | `npm run verify` | exit 0 |

## Done criteria

- [ ] All listed commands pass.
- [ ] `dist/` 双 bundle 均含 commit 插件，Claude 渲染的 SKILL.md 无 codex 块内
      容，反之亦然。
- [ ] SKILL.md 含全部安全规则（no-verify/force-push 禁令、泄密检查、push 需显式
      要求、不乱暂存）与意图摘要委派要求。
- [ ] Required tests exist and assert meaningful behavior.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files（尤其：发现必须改 `src/build.mjs` 才能
  达成，说明 skills-only 前提破裂）。
- A validation command fails twice after one reasonable fix.
- A named assumption is false.

## Maintenance notes

- Codex collab/spawn_agent 目前是 beta（需用户开启 `multi_agent: enabled`）。该
  功能转正或工具名变更时，只需更新 SKILL.md 的 codex target block 文案，无需动
  结构。
- Claude 侧模型名 `haiku` 是 Agent tool 的档位别名；若未来档位命名变化，skill
  文本同步改为"宿主最便宜档"即可，委派机制不变。
- 子代理拿不到会话上下文是本设计的固有 trade-off，意图摘要是唯一缓解；若用户反
  馈消息质量差，优先检查 skill 是否切实要求了摘要，而非换回贵模型。
