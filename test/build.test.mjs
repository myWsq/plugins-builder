import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertPortableTree,
  build,
  defaultProjectRoot,
  expandSkillFragments,
  validatePluginDescriptor
} from "../src/build.mjs";
import { checkRelease } from "../src/check-release.mjs";
import { validateReleaseTag } from "../src/check-tag.mjs";
import { syncRelease } from "../src/sync-release.mjs";

const RETIRED_MARKER_PATTERN = /<!--[\t ]*\/?(?:claude|codex)[\t ]*-->/;

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

async function writeHooksFixture(projectRoot, plugin) {
  const hooksRoot = join(projectRoot, "plugins", plugin, "hooks");
  await mkdir(hooksRoot, { recursive: true });
  await writeFile(join(hooksRoot, "rules.md"), "# Fixture rule\n");
  await writeFile(
    join(hooksRoot, "hooks.json"),
    JSON.stringify(
      {
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: "cat", args: ["${CLAUDE_PLUGIN_ROOT}/hooks/rules.md"] }] }
          ]
        }
      },
      null,
      2
    ) + "\n"
  );
  return hooksRoot;
}

async function loadFragmentFixture(plugin) {
  const fragmentsRoot = join(defaultProjectRoot, "plugins", plugin, "fragments");
  const fragments = new Map();
  for (const file of await readdir(fragmentsRoot)) {
    fragments.set(file.replace(/\.md$/, ""), await readFile(join(fragmentsRoot, file), "utf8"));
  }
  return fragments;
}

async function assertRenderedSkillTree(sourceRoot, generatedRoot, fragments = new Map()) {
  const sourceTree = await snapshotTree(sourceRoot);
  const generatedTree = await snapshotTree(generatedRoot);
  assert.deepEqual(Object.keys(generatedTree), Object.keys(sourceTree));

  for (const [path, sourceMetadata] of Object.entries(sourceTree)) {
    assert.equal(generatedTree[path].mode, sourceMetadata.mode, `mode for ${path}`);
    if (path.toLowerCase().endsWith(".md")) {
      const source = await readFile(join(sourceRoot, path), "utf8");
      assert.equal(
        await readFile(join(generatedRoot, path), "utf8"),
        expandSkillFragments(source, fragments, join(sourceRoot, path)),
        `content for ${path}`
      );
    } else {
      assert.equal(generatedTree[path].hash, sourceMetadata.hash, `hash for ${path}`);
    }
  }
}

async function bumpPluginVersion(root, name, version) {
  await updateJson(join(root, ".claude-plugin", "marketplace.json"), (marketplace) => {
    marketplace.plugins.find((entry) => entry.name === name).version = version;
  });
  await updateJson(join(root, "plugins", name, ".claude-plugin", "plugin.json"), (manifest) => {
    manifest.version = version;
  });
}

test("build emits a deterministic Claude Code marketplace", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-test-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const first = join(temporaryRoot, "first");
  const second = join(temporaryRoot, "second");

  await build({ outDir: first, sourceRevision: "test-revision" });
  await build({ outDir: second, sourceRevision: "test-revision" });

  assert.deepEqual(await snapshotTree(first), await snapshotTree(second));
  const marketplace = JSON.parse(
    await readFile(join(first, ".claude-plugin", "marketplace.json"), "utf8")
  );
  const devDescriptor = JSON.parse(
    await readFile(join(defaultProjectRoot, "catalog", "plugins", "dev.json"), "utf8")
  );
  assert.deepEqual(Object.keys(marketplace), ["name", "owner", "metadata", "plugins"]);
  assert.equal(marketplace.plugins[0].name, "dev");
  assert.equal(marketplace.plugins[0].source, "./plugins/dev");
  assert.equal(marketplace.plugins[0].version, devDescriptor.version);
  assert.equal(marketplace.plugins[0].category, devDescriptor.category);
  for (const entry of marketplace.plugins) {
    assert.match(entry.source, /^\.\/plugins\/[a-z0-9-]+$/, `${entry.name} source`);
    assert.deepEqual(
      Object.keys(entry),
      ["name", "source", "version", "description", "author", "category", "homepage"],
      `${entry.name} entry shape`
    );
  }

  const devManifest = JSON.parse(
    await readFile(join(first, "plugins", "dev", ".claude-plugin", "plugin.json"), "utf8")
  );
  assert.deepEqual(Object.keys(devManifest), [
    "name",
    "version",
    "description",
    "author",
    "homepage",
    "repository",
    "license",
    "keywords"
  ]);
  assert.equal(devManifest.version, devDescriptor.version);

  const sourceSkills = join(defaultProjectRoot, "plugins", "dev", "skills");
  const devFragments = await loadFragmentFixture("dev");
  assert.ok(devFragments.has("host-managed-worktrees"), "the dev plugin ships the shared host-managed worktree rule");
  await assertRenderedSkillTree(sourceSkills, join(first, "plugins", "dev", "skills"), devFragments);
  for (const skill of ["explore", "write-plan", "execute-plan", "advisor"]) {
    const rendered = await readFile(join(first, "plugins", "dev", "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(rendered, RETIRED_MARKER_PATTERN, `${skill} markers`);
    assert.doesNotMatch(rendered, /<!--[\t ]*include\b/, `${skill} includes`);
    assert.doesNotMatch(rendered, /default_mode_request_user_input/, `${skill} foreign prerequisite`);
  }
  await assert.rejects(lstat(join(first, "plugins", "dev", "fragments")), { code: "ENOENT" });

  assert.deepEqual(
    await snapshotTree(join(first, "docs")),
    await snapshotTree(join(defaultProjectRoot, "docs"))
  );
  const generatedReadme = await readFile(join(first, "README.md"), "utf8");
  assert.equal(generatedReadme, await readFile(join(defaultProjectRoot, "MARKET_README.md"), "utf8"));
  await assert.rejects(readFile(join(first, "plugins", "dev", "README.md")), { code: "ENOENT" });

  for (const retired of [
    ".agents",
    "claude-plugins",
    join("plugins", "dev", ".codex-plugin"),
    join("plugins", "dev", ".mcp.json")
  ]) {
    await assert.rejects(lstat(join(first, retired)), { code: "ENOENT" }, retired);
  }
});

test("build emits the git plugin with fragment-expanded skills", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-git-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const outDir = join(temporaryRoot, "dist");
  await build({ outDir, sourceRevision: "test-revision" });

  const marketplace = JSON.parse(
    await readFile(join(outDir, ".claude-plugin", "marketplace.json"), "utf8")
  );
  assert.ok(marketplace.plugins.some((entry) => entry.name === "git"));
  assert.ok(!marketplace.plugins.some((entry) => entry.name === "commit"));
  const removed = JSON.parse(await readFile(join(outDir, ".removed-plugins.json"), "utf8"));
  assert.ok(removed.includes("commit"));
  await assert.rejects(lstat(join(outDir, "plugins", "commit")), { code: "ENOENT" });

  const fragments = await loadFragmentFixture("git");
  assert.ok(fragments.has("commit-flow"), "the git plugin still ships the shared commit flow");
  await assertRenderedSkillTree(
    join(defaultProjectRoot, "plugins", "git", "skills"),
    join(outDir, "plugins", "git", "skills"),
    fragments
  );

  for (const skill of ["commit", "push", "pr", "clean"]) {
    const rendered = await readFile(join(outDir, "plugins", "git", "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(rendered, /<!--[\t ]*include\b/, `${skill} includes`);
  }
  for (const skill of ["commit", "push", "pr"]) {
    const rendered = await readFile(join(outDir, "plugins", "git", "skills", skill, "SKILL.md"), "utf8");
    assert.match(rendered, /mirrors the host's standard commit workflow/, `${skill} expands commit-flow`);
  }
  await assert.rejects(lstat(join(outDir, "plugins", "git", "fragments")), { code: "ENOENT" });
});

test("build ships plugin hooks into the bundle", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-hooks-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const projectRoot = await copyProjectFixture(temporaryRoot);
  const hooksRoot = await writeHooksFixture(projectRoot, "dev");
  const outDir = join(temporaryRoot, "dist");
  await build({ projectRoot, outDir, sourceRevision: "test-revision" });

  assert.deepEqual(
    await snapshotTree(join(outDir, "plugins", "dev", "hooks")),
    await snapshotTree(hooksRoot)
  );
  await assert.rejects(lstat(join(outDir, "plugins", "git", "hooks")), { code: "ENOENT" });
});

test("build ships plugin agents into the bundle", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-agents-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const outDir = join(temporaryRoot, "dist");
  await build({ outDir, sourceRevision: "test-revision" });

  assert.deepEqual(
    await snapshotTree(join(outDir, "plugins", "dev", "agents")),
    await snapshotTree(join(defaultProjectRoot, "plugins", "dev", "agents"))
  );
  await assert.rejects(lstat(join(outDir, "plugins", "git", "agents")), { code: "ENOENT" });
});

test("build rejects a plugin hooks directory without valid hooks.json", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-hooks-invalid-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const projectRoot = await copyProjectFixture(temporaryRoot);
  const hooksJson = join(await writeHooksFixture(projectRoot, "dev"), "hooks.json");

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

test("build rejects retired target markers in skill Markdown and copies other files verbatim", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-retired-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const projectRoot = await copyProjectFixture(temporaryRoot);
  const skillRoot = join(projectRoot, "plugins", "dev", "skills", "explore");
  const marked = "# Shared\n<!-- codex -->\nOne target only.\n<!-- /codex -->\n";

  await writeFile(join(skillRoot, "directive.txt"), marked);
  const outDir = join(temporaryRoot, "dist");
  await build({ projectRoot, outDir, sourceRevision: "test-revision" });
  assert.equal(
    await readFile(join(outDir, "plugins", "dev", "skills", "explore", "directive.txt"), "utf8"),
    marked
  );

  await mkdir(join(skillRoot, "references"), { recursive: true });
  const reference = join(skillRoot, "references", "platform.md");
  for (const [name, text] of [
    ["opening block", marked],
    ["stray close", "Shared.\n<!-- /claude -->\n"],
    ["padded inline marker", "Shared <!--\tclaude -->\n"]
  ]) {
    await writeFile(reference, text);
    await assert.rejects(
      build({ projectRoot, outDir: join(temporaryRoot, "rejected") }),
      (error) => {
        assert.match(error.message, /Retired target directive in /, name);
        assert.match(error.message, /explore[\\/]references[\\/]platform\.md/, name);
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
  const fragment = join(projectRoot, "plugins", "git", "fragments", "commit-flow.md");

  for (const text of [
    "<!-- include another-fragment -->\n",
    "Shared.\n<!-- claude -->\nOnly here.\n<!-- /claude -->\n"
  ]) {
    await writeFile(fragment, text);
    await assert.rejects(
      build({ projectRoot, outDir: join(temporaryRoot, "dist") }),
      /Skill fragment must not contain target or include directives/
    );
  }
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

test("descriptor validation requires a top-level category", async () => {
  const descriptor = JSON.parse(
    await readFile(join(defaultProjectRoot, "catalog", "plugins", "dev.json"), "utf8")
  );
  validatePluginDescriptor(descriptor);

  const { category, ...legacy } = descriptor;
  legacy.targets = { claude: { category } };
  assert.throws(() => validatePluginDescriptor(legacy), /dev\.category must be a non-empty string/);
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

  await bumpPluginVersion(nextDir, "dev", "999.0.0");
  await checkRelease({ currentDir, nextDir });
});

test("release gate treats the marketplace entry as versioned plugin payload", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-entry-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const currentDir = join(temporaryRoot, "current");
  const nextDir = join(temporaryRoot, "next");
  await build({ outDir: currentDir, sourceRevision: "current" });
  await build({ outDir: nextDir, sourceRevision: "next" });
  await updateJson(
    join(nextDir, ".claude-plugin", "marketplace.json"),
    (marketplace) => {
      marketplace.plugins[0].category = "productivity";
    }
  );
  await assert.rejects(
    checkRelease({ currentDir, nextDir }),
    /payload changed without a version bump/
  );
});

test("executor hooks ship intact and require a plugin version bump when changed", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-executor-release-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const currentDir = join(temporaryRoot, "current");
  const nextDir = join(temporaryRoot, "next");
  await build({ outDir: currentDir, sourceRevision: "current" });
  await cp(currentDir, nextDir, { recursive: true });
  const shipped = join(nextDir, "plugins", "dev", "hooks");
  assert.deepEqual(await snapshotTree(shipped), await snapshotTree(join(defaultProjectRoot, "plugins", "dev", "hooks")));
  const script = join(shipped, "executors.mjs");
  await writeFile(script, `${await readFile(script, "utf8")}\n// Changed executor policy.\n`);
  await assert.rejects(checkRelease({ currentDir, nextDir }), /payload changed without a version bump/);
  await bumpPluginVersion(nextDir, "dev", "999.0.0");
  await checkRelease({ currentDir, nextDir });
});

test("release gate resolves plugin roots from marketplace sources across a layout move", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-layout-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const currentDir = join(temporaryRoot, "current");
  const nextDir = join(temporaryRoot, "next");
  await build({ outDir: currentDir, sourceRevision: "current" });
  await build({ outDir: nextDir, sourceRevision: "next" });

  // Reshape `current` like the last dual-target snapshot: bundles under claude-plugins/, a second
  // index under .agents/, and plugins/<name>/ holding only a foreign manifest. A gate that guessed
  // the layout instead of following each entry's source would read the wrong tree here.
  await rename(join(currentDir, "plugins"), join(currentDir, "claude-plugins"));
  const currentIndex = join(currentDir, ".claude-plugin", "marketplace.json");
  const names = JSON.parse(await readFile(currentIndex, "utf8")).plugins.map((entry) => entry.name);
  await updateJson(currentIndex, (marketplace) => {
    for (const entry of marketplace.plugins) entry.source = `./claude-plugins/${entry.name}`;
  });
  await mkdir(join(currentDir, ".agents", "plugins"), { recursive: true });
  await writeFile(
    join(currentDir, ".agents", "plugins", "marketplace.json"),
    `${JSON.stringify({ name: "plugins", plugins: [] })}\n`
  );
  for (const name of names) {
    await mkdir(join(currentDir, "plugins", name, ".codex-plugin"), { recursive: true });
    await writeFile(
      join(currentDir, "plugins", name, ".codex-plugin", "plugin.json"),
      `${JSON.stringify({ name, version: "0.0.0" })}\n`
    );
  }

  // The moved source is part of every entry, so an unchanged version is rejected...
  await assert.rejects(
    checkRelease({ currentDir, nextDir }),
    /payload changed without a version bump/
  );
  // ...and a bump on every plugin lets the same gate read both layouts.
  for (const name of names) await bumpPluginVersion(nextDir, name, "999.0.0");
  const result = await checkRelease({ currentDir, nextDir });
  assert.equal(result.pluginCount, names.length);

  const nextIndex = join(nextDir, ".claude-plugin", "marketplace.json");
  for (const [source, message] of [
    ["../outside", /must stay inside the marketplace root/],
    ["./", /must stay inside the marketplace root/],
    ["/tmp/outside", /must declare a relative source path/],
    [{ source: "local", path: "./plugins/dev" }, /must declare a relative source path/],
    ["./plugins/missing", /is not a directory in the marketplace/]
  ]) {
    await updateJson(nextIndex, (marketplace) => {
      marketplace.plugins[0].source = source;
    });
    await assert.rejects(checkRelease({ currentDir, nextDir }), message, JSON.stringify(source));
  }
});

test("release gate blocks plugin removal unless declared in catalog.removed", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-removal-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const currentDir = join(temporaryRoot, "current");
  const nextDir = join(temporaryRoot, "next");
  await build({ outDir: currentDir, sourceRevision: "current" });

  const projectRoot = await copyProjectFixture(temporaryRoot);
  const catalogPath = join(projectRoot, "catalog", "marketplace.json");
  await updateJson(catalogPath, (catalog) => {
    catalog.plugins = catalog.plugins.filter((name) => name !== "arch");
    delete catalog.removed;
  });
  await build({ projectRoot, outDir: nextDir, sourceRevision: "next" });
  await assert.rejects(
    checkRelease({ currentDir, nextDir }),
    /without a catalog\.removed declaration: arch/
  );

  await updateJson(catalogPath, (catalog) => {
    catalog.removed = ["arch"];
  });
  await build({ projectRoot, outDir: nextDir, sourceRevision: "next" });
  await checkRelease({ currentDir, nextDir });

  await updateJson(catalogPath, (catalog) => {
    catalog.removed = ["dev"];
  });
  await assert.rejects(
    build({ projectRoot, outDir: join(temporaryRoot, "conflict") }),
    /catalog\.removed conflicts with an active plugin: dev/
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
