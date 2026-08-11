# Plan 006: commit 插件新增 commit-push skill

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat ad98488..HEAD -- plugins/commit catalog/plugins/commit.json test/build.test.mjs src/build.mjs`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: feature
- Execution: subagent
- Planned at: `ad98488`, 2026-08-11

## Requirement

commit 插件目前有三个 skill：`commit`（默认只 commit，用户显式要求才 push）、
`commit-pr`（commit + push + 开 PR）、`commit-clean`（清理 gone 分支）。缺一个
"调用即为 push 授权"的斜杠命令入口：`/commit:commit` 默认 commit-only，想
push 必须再用自然语言补一句。

完成后：存在第四个 skill `commit-push` —— 走与 `commit` 完全相同的 commit
流程（复用 `commit-flow` fragment），随后把当前分支 push 到其上游（无上游则
`git push -u origin HEAD` 建立上游）；不开 PR、不切换分支、不新建分支。调用
该命令本身即构成 commit-flow 第 7 步所说的 "invoking a command whose job
includes pushing counts as asking"。

正确与相邻错误的分界：commit-push **允许在默认分支上 push 到远端默认分支**
（这正是它的主用例——个人项目直接在 main 上工作）。任何"在 main 上拒绝
push"或"自动转到新分支再 push"的实现都是错的，那是 commit-pr 的职责。

## Decisions & tradeoffs

- **新增独立 skill 而非扩展 commit 传参**: 新建
  `plugins/commit/skills/commit-push/SKILL.md`。Rejected: 让用户用
  `/commit:commit push` 传参 — 功能上已可行但斜杠补全中不可发现。
  Based on: `plugins/commit/fragments/commit-flow.md:9` 第 7 步已预留
  "invoking a command whose job includes pushing counts as asking" 语义。
- **复用 commit-flow fragment，不修改其本体**: SKILL.md 通过独占一行的
  `<!-- include commit-flow -->` 复用提交流程。Rejected: 复制流程文本 —
  三个现有 skill 均走 fragment，复制会造成漂移。
  Based on: `plugins/commit/skills/commit/SKILL.md:12`、include 正则要求独占
  一行且 kebab-case（`src/build.mjs:18`）。
- **push 目标 = 当前分支上游，含默认分支**: commit 后 `git push`；无上游时
  `git push -u origin HEAD`。Rejected: 默认分支上拒绝 push 或先建分支 —
  会使该命令对"直接在 main 上工作"的主用例失效，且分支保护属于远端配置的
  职责。禁止 `--force`（fragment 第 7 步已含）。
- **catalog description 的安全底线声明收窄到 commit-pr**（decided while
  planning）: `catalog/plugins/commit.json` 的 `description` 现声称插件级
  底线 "never put a commit on the remote default branch"，commit-push 落地后
  该声明失真。改写 `description`（及 `longDescription` 相应句）使"不碰远端
  默认分支"明确限定为 commit-pr 的行为，而非插件级承诺。Rejected: 保持原文 —
  发布元数据与实际行为矛盾。Based on: `catalog/plugins/commit.json` 的
  `description` 字段现文。
- **catalog 版本 0.2.0 → 0.3.0，longDescription 覆盖四个 skill**: 新增
  rendered 内容即 shipped payload 变化，必须 bump 插件版本。Based on:
  `AGENTS.md`（"Adding or changing rendered content changes shipped payload,
  so bump the plugin"）；现 `longDescription` 写死 "three skills"。
- **description 风格与现有 skill 一致**: frontmatter description = 一句功能 +
  触发场景例句（含中文触发词，如 "提交并推送"）。Based on:
  `plugins/commit/skills/commit-pr/SKILL.md:3` 的现行风格。
- **defaultPrompt / keywords / shortDescription 不动**: 现有条目仍准确，
  commit-push 由斜杠命令或自然语言触发。Rejected: 顺手加一条 push 提示语 —
  非必要的发布面变化。

## Direction

单里程碑即可完成，但按验证边界拆为两个：

### Milestone 1: commit-push skill 存在且可构建

`plugins/commit/skills/commit-push/SKILL.md` 新建：frontmatter（name +
description）、"调用即 push 授权"声明、include commit-flow、push 步骤
（含无上游处理）、报告要求（commit message、hash、push 目的地）。正文措辞
参照 `commit-pr/SKILL.md` 的密度——薄，不复述 fragment 已有规则。
`catalog/plugins/commit.json` 同步：version 0.3.0、longDescription 覆盖四个
skill、description 底线声明收窄。
Validation: `npm run build` -> exit 0，且
`dist/claude-plugins/commit/skills/commit-push/SKILL.md` 存在、不含
`<!-- include` 残留。

### Milestone 2: 测试覆盖新 skill

`test/build.test.mjs` 中硬编码的 skill 列表扩展为含 `commit-push`，使新
skill 获得与其余三个相同的"include 已解析"断言。
Validation: `npm test` -> exit 0。

## Landmines

- `test/build.test.mjs:231` 硬编码 `["commit", "commit-pr", "commit-clean"]`
  —— 不更新则新 skill 无测试覆盖；该文件同时在多处按路径断言 commit 插件
  产物，改动时只扩列表、勿动其余断言。
- `catalog/plugins/commit.json` `description` 字段的插件级底线声明与
  commit-push 行为冲突（见 Decisions），漏改则发布元数据说谎。
- include 指令必须独占一行、kebab-case（`src/build.mjs:18` 的
  `INCLUDE_DIRECTIVE_PATTERN`），行内或拼错会直接构建失败。
- SKILL.md 频繁出现的 `<!-- codex -->`/`<!-- claude -->` 目标块本 skill 不需
  要；误用未闭合标记是构建错误（`AGENTS.md`）。

## Scope

In scope:

- `plugins/commit/skills/commit-push/SKILL.md`（新建）
- `catalog/plugins/commit.json`
- `test/build.test.mjs`（仅扩展 skill 列表断言）
- `wiki/plans/006-commit-push-skill.md`、`wiki/plans/README.md`（状态更新）

Out of scope:

- `plugins/commit/fragments/commit-flow.md` — 已批准方向明确不改 fragment 本体
- `plugins/commit/skills/{commit,commit-pr,commit-clean}/SKILL.md` — 行为不变
- `src/build.mjs` — 编译器无需改动，skills/ 下 Markdown 自动渲染
- `MARKET_README.md`、`docs/` — 无按 skill 的清单需要同步
- push/PR 等远端操作 — 不在本次执行授权范围

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Unit tests | `npm test` | exit 0 |
| Build | `npm run build` | exit 0 |
| 合并验证 | `npm run verify` | exit 0 |

## Done criteria

- [ ] All listed commands pass.
- [ ] `dist/claude-plugins/commit/skills/commit-push/SKILL.md` 与
      `dist/plugins/commit/skills/commit-push/SKILL.md` 渲染产出，字节一致，
      无 include/target 标记残留。
- [ ] `catalog/plugins/commit.json`：version 为 0.3.0，longDescription 覆盖
      四个 skill，description 不再作插件级"不碰远端默认分支"承诺。
- [ ] `test/build.test.mjs` 的 skill 列表断言含 commit-push。
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.
- A named assumption is false.

## Maintenance notes

- commit 插件的安全底线自此分层：staging/秘密检查/禁 force-push 是插件级
  （fragment），"不碰远端默认分支"仅是 commit-pr 级。后续新增 skill 或改
  发布文案时维持这个分层表述。
- 官方 `commit-commands` 插件命令面为 `commit` / `commit-push-pr` /
  `clean_gone`，本插件自此为四命令面，catalog 中如再出现 "mirrors the
  command surface" 措辞需注意已是超集。
