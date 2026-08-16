import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertPortableTree,
  build,
  defaultProjectRoot,
  expandSkillFragments,
  renderTargetMarkdown,
  validatePluginDescriptor
} from "../src/build.mjs";
import { checkRelease } from "../src/check-release.mjs";
import { validateReleaseTag } from "../src/check-tag.mjs";
import { syncRelease } from "../src/sync-release.mjs";

async function snapshotTree(root) {
  const snapshot = {};

  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stat = await lstat(path);
      if (stat.isDirectory()) {
        await visit(path, relativePath);
      } else {
        const content = await readFile(path);
        snapshot[relativePath] = {
          hash: createHash("sha256").update(content).digest("hex"),
          mode: stat.mode & 0o777
        };
      }
    }
  }

  await visit(root);
  return snapshot;
}

async function updateJson(path, update) {
  const value = JSON.parse(await readFile(path, "utf8"));
  update(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function copyProjectFixture(temporaryRoot) {
  const projectRoot = join(temporaryRoot, "project");
  await mkdir(projectRoot, { recursive: true });
  for (const directory of ["catalog", "docs", "plugins"]) {
    await cp(join(defaultProjectRoot, directory), join(projectRoot, directory), { recursive: true });
  }
  for (const file of ["LICENSE", "MARKET_README.md", "package.json"]) {
    await cp(join(defaultProjectRoot, file), join(projectRoot, file));
  }
  return projectRoot;
}

async function assertRenderedSkillTree(sourceRoot, generatedRoot, target, fragments = new Map()) {
  const sourceTree = await snapshotTree(sourceRoot);
  const generatedTree = await snapshotTree(generatedRoot);
  assert.deepEqual(Object.keys(generatedTree), Object.keys(sourceTree));

  for (const [path, sourceMetadata] of Object.entries(sourceTree)) {
    assert.equal(generatedTree[path].mode, sourceMetadata.mode, `${target} mode for ${path}`);
    if (path.toLowerCase().endsWith(".md")) {
      const source = await readFile(join(sourceRoot, path), "utf8");
      const targeted = renderTargetMarkdown(source, target, join(sourceRoot, path));
      assert.equal(
        await readFile(join(generatedRoot, path), "utf8"),
        expandSkillFragments(targeted, fragments, join(sourceRoot, path)),
        `${target} content for ${path}`
      );
    } else {
      assert.equal(generatedTree[path].hash, sourceMetadata.hash, `${target} hash for ${path}`);
    }
  }
}

test("build emits deterministic Claude and Codex marketplaces", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-test-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const first = join(temporaryRoot, "first");
  const second = join(temporaryRoot, "second");

  await build({ outDir: first, sourceRevision: "test-revision" });
  await build({ outDir: second, sourceRevision: "test-revision" });

  assert.deepEqual(await snapshotTree(first), await snapshotTree(second));
  const claudeMarketplace = JSON.parse(
    await readFile(join(first, ".claude-plugin", "marketplace.json"), "utf8")
  );
  const codexMarketplace = JSON.parse(
    await readFile(join(first, ".agents", "plugins", "marketplace.json"), "utf8")
  );
  assert.equal(claudeMarketplace.plugins[0].source, "./claude-plugins/dev");
  const devDescriptor = JSON.parse(
    await readFile(join(defaultProjectRoot, "catalog", "plugins", "dev.json"), "utf8")
  );
  assert.equal(claudeMarketplace.plugins[0].version, devDescriptor.version);
  assert.equal(codexMarketplace.plugins[0].source.path, "./plugins/dev");

  const sourceSkills = join(defaultProjectRoot, "plugins", "dev", "skills");
  const fragments = new Map([
    [
      "codex-request-user-input",
      await readFile(
        join(defaultProjectRoot, "plugins", "dev", "fragments", "codex-request-user-input.md"),
        "utf8"
      )
    ]
  ]);
  await assertRenderedSkillTree(
    sourceSkills,
    join(first, "claude-plugins", "dev", "skills"),
    "claude",
    fragments
  );
  await assertRenderedSkillTree(
    sourceSkills,
    join(first, "plugins", "dev", "skills"),
    "codex",
    fragments
  );

  for (const skill of ["dev-explore", "dev-write-plan", "dev-execute-plan"]) {
    const sourceSkill = await readFile(join(sourceSkills, skill, "SKILL.md"), "utf8");
    const claudeSkill = await readFile(
      join(first, "claude-plugins", "dev", "skills", skill, "SKILL.md"),
      "utf8"
    );
    const codexSkill = await readFile(
      join(first, "plugins", "dev", "skills", skill, "SKILL.md"),
      "utf8"
    );
    assert.match(sourceSkill, /<!-- include codex-request-user-input -->/);
    assert.doesNotMatch(sourceSkill, /default_mode_request_user_input/);
    assert.doesNotMatch(claudeSkill, /default_mode_request_user_input/);
    assert.match(codexSkill, /request_user_input/);
    assert.match(codexSkill, /codex features enable default_mode_request_user_input/);
    assert.doesNotMatch(claudeSkill, /<!-- \/?(?:codex|claude) -->/);
    assert.doesNotMatch(codexSkill, /<!-- \/?(?:codex|claude) -->/);
    assert.doesNotMatch(codexSkill, /<!-- include /);
  }
  await assert.rejects(lstat(join(first, "claude-plugins", "dev", "fragments")), { code: "ENOENT" });
  await assert.rejects(lstat(join(first, "plugins", "dev", "fragments")), { code: "ENOENT" });

  assert.deepEqual(
    await snapshotTree(join(first, "docs")),
    await snapshotTree(join(defaultProjectRoot, "docs"))
  );
  const canonicalDocs = await readFile(join(defaultProjectRoot, "docs", "dev.md"), "utf8");
  assert.equal(await readFile(join(first, "docs", "dev.md"), "utf8"), canonicalDocs);
  const generatedReadme = await readFile(join(first, "README.md"), "utf8");
  assert.equal(generatedReadme, await readFile(join(defaultProjectRoot, "MARKET_README.md"), "utf8"));
  assert.match(generatedReadme, /codex features enable default_mode_request_user_input/);
  await assert.rejects(readFile(join(first, "claude-plugins", "dev", "README.md")), {
    code: "ENOENT"
  });
  await assert.rejects(readFile(join(first, "plugins", "dev", "README.md")), {
    code: "ENOENT"
  });
  const codexManifest = JSON.parse(
    await readFile(join(first, "plugins", "dev", ".codex-plugin", "plugin.json"), "utf8")
  );
  assert.equal(codexManifest.skills, "./skills/");
  await assert.rejects(lstat(join(first, "claude-plugins", "dev", ".mcp.json")), { code: "ENOENT" });
  await assert.rejects(lstat(join(first, "plugins", "dev", ".mcp.json")), { code: "ENOENT" });
});

test("build emits the commit plugin with fragment-expanded skills in both bundles", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-commit-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const outDir = join(temporaryRoot, "dist");
  await build({ outDir, sourceRevision: "test-revision" });

  const claudeMarketplace = JSON.parse(
    await readFile(join(outDir, ".claude-plugin", "marketplace.json"), "utf8")
  );
  const codexMarketplace = JSON.parse(
    await readFile(join(outDir, ".agents", "plugins", "marketplace.json"), "utf8")
  );
  assert.ok(claudeMarketplace.plugins.some((entry) => entry.name === "commit"));
  assert.ok(codexMarketplace.plugins.some((entry) => entry.name === "commit"));

  const claudeSkill = await readFile(
    join(outDir, "claude-plugins", "commit", "skills", "commit", "SKILL.md"),
    "utf8"
  );
  const codexSkill = await readFile(
    join(outDir, "plugins", "commit", "skills", "commit", "SKILL.md"),
    "utf8"
  );
  assert.equal(claudeSkill, codexSkill);
  assert.doesNotMatch(claudeSkill, /<!-- \/?(?:codex|claude) -->/);
  assert.doesNotMatch(codexSkill, /<!-- \/?(?:codex|claude) -->/);

  for (const skill of ["commit", "commit-push", "commit-pr", "commit-clean"]) {
    for (const bundle of [join("claude-plugins", "commit"), join("plugins", "commit")]) {
      const rendered = await readFile(join(outDir, bundle, "skills", skill, "SKILL.md"), "utf8");
      assert.doesNotMatch(rendered, /<!--[\t ]*include\b/);
    }
  }
  const claudePushPr = await readFile(
    join(outDir, "claude-plugins", "commit", "skills", "commit-pr", "SKILL.md"),
    "utf8"
  );
  assert.match(claudeSkill, /mirrors the host's standard commit workflow/);
  assert.match(claudePushPr, /mirrors the host's standard commit workflow/);
  await assert.rejects(lstat(join(outDir, "claude-plugins", "commit", "fragments")), {
    code: "ENOENT"
  });

  await assert.rejects(lstat(join(outDir, "claude-plugins", "commit", ".mcp.json")), {
    code: "ENOENT"
  });
});

test("build ships plugin hooks to the Claude bundle only", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-hooks-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const outDir = join(temporaryRoot, "dist");
  await build({ outDir, sourceRevision: "test-revision" });

  const sourceHooks = await snapshotTree(
    join(defaultProjectRoot, "plugins", "subagent-model", "hooks")
  );
  assert.deepEqual(
    await snapshotTree(join(outDir, "claude-plugins", "subagent-model", "hooks")),
    sourceHooks
  );
  await assert.rejects(lstat(join(outDir, "plugins", "subagent-model", "hooks")), {
    code: "ENOENT"
  });
});

test("build ships plugin agents to the Claude bundle only", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-agents-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const outDir = join(temporaryRoot, "dist");
  await build({ outDir, sourceRevision: "test-revision" });

  const sourceAgents = await snapshotTree(join(defaultProjectRoot, "plugins", "dev", "agents"));
  assert.deepEqual(
    await snapshotTree(join(outDir, "claude-plugins", "dev", "agents")),
    sourceAgents
  );
  await assert.rejects(lstat(join(outDir, "plugins", "dev", "agents")), {
    code: "ENOENT"
  });
});

test("build rejects a plugin hooks directory without valid hooks.json", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-hooks-invalid-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const projectRoot = await copyProjectFixture(temporaryRoot);
  const hooksJson = join(projectRoot, "plugins", "subagent-model", "hooks", "hooks.json");

  await writeFile(hooksJson, "{ not json\n");
  await assert.rejects(
    build({ projectRoot, outDir: join(temporaryRoot, "dist") }),
    /Invalid JSON in .*hooks\.json/
  );

  await rm(hooksJson, { force: true });
  await assert.rejects(
    build({ projectRoot, outDir: join(temporaryRoot, "dist") }),
    /Unable to read .*hooks\.json/
  );
});

test("build renders target blocks in skill Markdown without renaming source files", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-target-skill-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const projectRoot = await copyProjectFixture(temporaryRoot);
  const skillRoot = join(projectRoot, "plugins", "dev", "skills", "dev-explore");
  const source = [
    "# Shared\n",
    "<!-- codex -->\n",
    "Codex only.\n",
    "<!-- /codex -->\n",
    "<!-- claude -->\n",
    "Claude only.\n",
    "<!-- /claude -->\n"
  ].join("");
  await writeFile(join(skillRoot, "SKILL.md"), source);
  await mkdir(join(skillRoot, "references"), { recursive: true });
  await writeFile(
    join(skillRoot, "references", "platform.md"),
    "Shared reference.\n<!-- codex -->\nCodex reference.\n<!-- /codex -->\n"
  );
  await writeFile(join(skillRoot, "directive.txt"), source);

  const outDir = join(temporaryRoot, "dist");
  await build({ projectRoot, outDir, sourceRevision: "test-revision" });

  const claudeSkillRoot = join(outDir, "claude-plugins", "dev", "skills", "dev-explore");
  const codexSkillRoot = join(outDir, "plugins", "dev", "skills", "dev-explore");
  assert.equal(await readFile(join(claudeSkillRoot, "SKILL.md"), "utf8"), "# Shared\nClaude only.\n");
  assert.equal(await readFile(join(codexSkillRoot, "SKILL.md"), "utf8"), "# Shared\nCodex only.\n");
  assert.equal(
    await readFile(join(claudeSkillRoot, "references", "platform.md"), "utf8"),
    "Shared reference.\n"
  );
  assert.equal(
    await readFile(join(codexSkillRoot, "references", "platform.md"), "utf8"),
    "Shared reference.\nCodex reference.\n"
  );
  assert.equal(await readFile(join(claudeSkillRoot, "directive.txt"), "utf8"), source);
  assert.equal(await readFile(join(codexSkillRoot, "directive.txt"), "utf8"), source);
});

test("target block rendering rejects malformed known directives", () => {
  const sourcePath = "plugins/example/skills/example/SKILL.md";
  const invalidSources = [
    ["orphan close", "<!-- /codex -->\n", /closing codex without an open block/],
    [
      "mismatched close",
      "<!-- codex -->\ntext\n<!-- /claude -->\n",
      /closing claude while codex is open/
    ],
    [
      "nested block",
      "<!-- codex -->\n<!-- claude -->\n<!-- /claude -->\n<!-- /codex -->\n",
      /nested claude block inside codex/
    ],
    ["unclosed block", "<!-- claude -->\ntext\n", /unclosed claude block/],
    ["inline marker", "text <!-- codex -->\n", /directives must occupy their own line/]
  ];

  for (const [name, source, message] of invalidSources) {
    assert.throws(
      () => renderTargetMarkdown(source, "codex", sourcePath),
      (error) => {
        assert.match(error.message, message, name);
        assert.match(error.message, new RegExp(sourcePath.replaceAll("/", "\\/")), name);
        return true;
      }
    );
  }
});

test("fragment includes expand once and reject invalid references", () => {
  const fragments = new Map([["shared", "Shared fragment.\n"]]);
  assert.equal(
    expandSkillFragments("Before.\n<!-- include shared -->\nAfter.\n", fragments, "SKILL.md"),
    "Before.\nShared fragment.\nAfter.\n"
  );
  assert.throws(
    () => expandSkillFragments("<!-- include missing -->\n", fragments, "SKILL.md"),
    /Unknown skill fragment missing referenced by SKILL\.md/
  );
  assert.throws(
    () => expandSkillFragments("text <!-- include shared -->\n", fragments, "SKILL.md"),
    /includes must occupy their own line and use a kebab-case name/
  );
});

test("build rejects directives inside skill fragments", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-fragment-source-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const projectRoot = await copyProjectFixture(temporaryRoot);
  await writeFile(
    join(projectRoot, "plugins", "dev", "fragments", "codex-request-user-input.md"),
    "<!-- include another-fragment -->\n"
  );

  await assert.rejects(
    build({ projectRoot, outDir: join(temporaryRoot, "dist") }),
    /Skill fragment must not contain target or include directives/
  );
});

test("build removes stale generated files", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-stale-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const outDir = join(temporaryRoot, "dist");

  await build({ outDir, sourceRevision: "test-revision" });
  await writeFile(join(outDir, "stale.txt"), "stale\n");
  await build({ outDir, sourceRevision: "test-revision" });
  await assert.rejects(readFile(join(outDir, "stale.txt")), { code: "ENOENT" });
});

test("release sync preserves .git and removes stale output", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-sync-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const sourceDir = join(temporaryRoot, "dist");
  const targetDir = join(temporaryRoot, "target");
  await build({ outDir: sourceDir, sourceRevision: "test-revision" });
  await mkdir(join(targetDir, ".git"), { recursive: true });
  await writeFile(join(targetDir, ".git", "HEAD"), "ref: refs/heads/main\n");

  await syncRelease({ sourceDir, targetDir });
  await writeFile(join(targetDir, "stale.txt"), "stale\n");
  await syncRelease({ sourceDir, targetDir });

  assert.equal(await readFile(join(targetDir, ".git", "HEAD"), "utf8"), "ref: refs/heads/main\n");
  await assert.rejects(readFile(join(targetDir, "stale.txt")), { code: "ENOENT" });
  assert.deepEqual(
    await snapshotTree(sourceDir),
    Object.fromEntries(
      Object.entries(await snapshotTree(targetDir)).filter(([path]) => !path.startsWith(".git/"))
    )
  );
});

test("release sync refuses to guess a target", async () => {
  await assert.rejects(syncRelease(), /targetDir is required/);
  await assert.rejects(syncRelease({}), /targetDir is required/);
});

test("descriptor validation rejects invalid semver", () => {
  assert.throws(
    () =>
      validatePluginDescriptor({
        name: "dev",
        version: "latest"
      }),
    /strict semver/
  );
  assert.throws(
    () =>
      validatePluginDescriptor({
        name: "dev",
        version: "1.0.0-01"
      }),
    /strict semver/
  );
});

test("portable source validation rejects symlinks", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-link-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  await writeFile(join(temporaryRoot, "target.txt"), "target\n");
  await symlink("target.txt", join(temporaryRoot, "link.txt"));
  await assert.rejects(assertPortableTree(temporaryRoot), /Symlinks are not allowed/);
});

test("release tag must match the builder package version", () => {
  assert.equal(validateReleaseTag("v0.2.1", "0.2.1"), "0.2.1");
  assert.throws(
    () => validateReleaseTag("v0.2.2", "0.2.1"),
    /must match package.json version/
  );
});

test("release gate requires a plugin version bump for payload changes", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-release-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const currentDir = join(temporaryRoot, "current");
  const nextDir = join(temporaryRoot, "next");
  await build({ outDir: currentDir, sourceRevision: "current" });
  await build({ outDir: nextDir, sourceRevision: "next" });

  await checkRelease({ currentDir, nextDir });
  await writeFile(
    join(nextDir, "plugins", "dev", "skills", "release-change.txt"),
    "changed\n"
  );
  await assert.rejects(
    checkRelease({ currentDir, nextDir }),
    /payload changed without a version bump/
  );

  await updateJson(
    join(nextDir, ".claude-plugin", "marketplace.json"),
    (marketplace) => {
      marketplace.plugins[0].version = "999.0.0";
    }
  );
  await updateJson(
    join(nextDir, "claude-plugins", "dev", ".claude-plugin", "plugin.json"),
    (manifest) => {
      manifest.version = "999.0.0";
    }
  );
  await updateJson(
    join(nextDir, "plugins", "dev", ".codex-plugin", "plugin.json"),
    (manifest) => {
      manifest.version = "999.0.0";
    }
  );
  await checkRelease({ currentDir, nextDir });
});

test("release gate treats marketplace policy as versioned plugin payload", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-policy-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const currentDir = join(temporaryRoot, "current");
  const nextDir = join(temporaryRoot, "next");
  await build({ outDir: currentDir, sourceRevision: "current" });
  await build({ outDir: nextDir, sourceRevision: "next" });
  await updateJson(
    join(nextDir, ".agents", "plugins", "marketplace.json"),
    (marketplace) => {
      marketplace.plugins[0].policy.authentication = "ON_USE";
    }
  );
  await assert.rejects(
    checkRelease({ currentDir, nextDir }),
    /payload changed without a version bump/
  );
});

test("marketplace documentation is outside the plugin version contract", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-docs-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const currentDir = join(temporaryRoot, "current");
  const nextDir = join(temporaryRoot, "next");
  await build({ outDir: currentDir, sourceRevision: "current" });
  await build({ outDir: nextDir, sourceRevision: "next" });
  await writeFile(join(nextDir, "docs", "dev.md"), "docs-only change\n");

  await checkRelease({ currentDir, nextDir });
});

test("executor agents state their pinned model in the description", async () => {
  const agentsDir = join(defaultProjectRoot, "plugins", "dev", "agents");
  const files = (await readdir(agentsDir)).filter((name) => name.endsWith(".md"));
  assert.ok(files.length > 0, "expected at least one executor agent");

  for (const file of files) {
    const source = await readFile(join(agentsDir, file), "utf8");
    const name = source.match(/^name:\s*(\S+)$/m)?.[1];
    const model = source.match(/^model:\s*(\S+)$/m)?.[1];
    const description = source.match(/^description:\s*(.+)$/m)?.[1] ?? "";

    assert.equal(name, file.replace(/\.md$/, ""), `${file}: name must match filename`);
    assert.ok(model, `${file}: missing pinned model`);
    assert.ok(
      description.includes(model),
      `${file}: description must state the pinned model ${model} verbatim — it is the only copy callers can read at dispatch time`
    );
  }
});
