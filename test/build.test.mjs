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
  renderTargetMarkdown,
  validatePluginDescriptor
} from "../src/build.mjs";
import { checkRelease } from "../src/check-release.mjs";
import { validateReleaseTag } from "../src/check-tag.mjs";
import { syncLocal } from "../src/sync-local.mjs";

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
  assert.equal(claudeMarketplace.plugins[0].version, "0.2.1");
  assert.equal(codexMarketplace.plugins[0].source.path, "./plugins/dev");

  const sourceSkills = await snapshotTree(join(defaultProjectRoot, "plugins", "dev", "skills"));
  assert.deepEqual(
    await snapshotTree(join(first, "claude-plugins", "dev", "skills")),
    sourceSkills
  );
  assert.deepEqual(await snapshotTree(join(first, "plugins", "dev", "skills")), sourceSkills);
  const sourceMcp = await snapshotTree(join(defaultProjectRoot, "plugins", "dev", "mcp"));
  assert.deepEqual(await snapshotTree(join(first, "claude-plugins", "dev", "mcp")), sourceMcp);
  assert.deepEqual(await snapshotTree(join(first, "plugins", "dev", "mcp")), sourceMcp);

  const claudeMcp = JSON.parse(
    await readFile(join(first, "claude-plugins", "dev", ".mcp.json"), "utf8")
  );
  assert.deepEqual(claudeMcp, {
    "dev-agents": {
      command: "node",
      args: ["${CLAUDE_PLUGIN_ROOT}/mcp/server.mjs"]
    }
  });
  const codexMcp = JSON.parse(
    await readFile(join(first, "plugins", "dev", ".mcp.json"), "utf8")
  );
  assert.deepEqual(codexMcp, {
    mcpServers: {
      "dev-agents": {
        command: "node",
        args: ["./mcp/server.mjs"],
        cwd: "."
      }
    }
  });
  assert.deepEqual(
    await snapshotTree(join(first, "docs")),
    await snapshotTree(join(defaultProjectRoot, "docs"))
  );
  const canonicalDocs = await readFile(join(defaultProjectRoot, "docs", "dev.md"), "utf8");
  assert.equal(await readFile(join(first, "docs", "dev.md"), "utf8"), canonicalDocs);
  assert.equal(
    await readFile(join(first, "README.md"), "utf8"),
    await readFile(join(defaultProjectRoot, "MARKET_README.md"), "utf8")
  );
  await assert.rejects(readFile(join(first, "claude-plugins", "dev", "README.md")), {
    code: "ENOENT"
  });
  await assert.rejects(readFile(join(first, "plugins", "dev", "README.md")), {
    code: "ENOENT"
  });
  const claudeManifest = JSON.parse(
    await readFile(join(first, "claude-plugins", "dev", ".claude-plugin", "plugin.json"), "utf8")
  );
  assert.equal(claudeManifest.mcpServers, undefined);
  const codexManifest = JSON.parse(
    await readFile(join(first, "plugins", "dev", ".codex-plugin", "plugin.json"), "utf8")
  );
  assert.equal(codexManifest.skills, "./skills/");
  assert.equal(codexManifest.mcpServers, "./.mcp.json");
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

test("build removes stale generated files", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-stale-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const outDir = join(temporaryRoot, "dist");

  await build({ outDir, sourceRevision: "test-revision" });
  await writeFile(join(outDir, "stale.txt"), "stale\n");
  await build({ outDir, sourceRevision: "test-revision" });
  await assert.rejects(readFile(join(outDir, "stale.txt")), { code: "ENOENT" });
});

test("local sync preserves .git and removes stale output", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-sync-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const sourceDir = join(temporaryRoot, "dist");
  const targetDir = join(temporaryRoot, "target");
  await build({ outDir: sourceDir, sourceRevision: "test-revision" });
  await mkdir(join(targetDir, ".git"), { recursive: true });
  await writeFile(join(targetDir, ".git", "HEAD"), "ref: refs/heads/main\n");

  await syncLocal({ sourceDir, targetDir });
  await writeFile(join(targetDir, "stale.txt"), "stale\n");
  await syncLocal({ sourceDir, targetDir });

  assert.equal(await readFile(join(targetDir, ".git", "HEAD"), "utf8"), "ref: refs/heads/main\n");
  await assert.rejects(readFile(join(targetDir, "stale.txt")), { code: "ENOENT" });
  assert.deepEqual(
    await snapshotTree(sourceDir),
    Object.fromEntries(
      Object.entries(await snapshotTree(targetDir)).filter(([path]) => !path.startsWith(".git/"))
    )
  );
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

test("descriptor validation rejects unsafe MCP names and entries", async () => {
  const descriptor = JSON.parse(
    await readFile(join(defaultProjectRoot, "catalog", "plugins", "dev.json"), "utf8")
  );
  assert.throws(
    () =>
      validatePluginDescriptor({
        ...descriptor,
        mcpServers: {
          "../dev-agents": {
            command: "node",
            entry: "mcp/server.mjs"
          }
        }
      }),
    /unsafe server name/
  );
  assert.throws(
    () =>
      validatePluginDescriptor({
        ...descriptor,
        mcpServers: {
          "dev-agents": {
            command: "node --inspect",
            entry: "mcp/server.mjs"
          }
        }
      }),
    /safe executable name/
  );

  for (const entry of [
    "/mcp/server.mjs",
    "../mcp/server.mjs",
    "mcp/../server.mjs",
    "mcp\\server.mjs",
    "scripts/server.mjs"
  ]) {
    assert.throws(
      () =>
        validatePluginDescriptor({
          ...descriptor,
          mcpServers: {
            "dev-agents": {
              command: "node",
              entry
            }
          }
        }),
      /safe relative path under mcp\//
    );
  }
});

test("build rejects a missing MCP source entry", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plugins-builder-mcp-source-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const projectRoot = await copyProjectFixture(temporaryRoot);
  await rm(join(projectRoot, "plugins", "dev", "mcp", "server.mjs"), { force: true });

  await assert.rejects(
    build({ projectRoot, outDir: join(temporaryRoot, "dist") }),
    /MCP server dev-agents entry does not exist: mcp\/server\.mjs/
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
      marketplace.plugins[0].version = "0.2.2";
    }
  );
  await updateJson(
    join(nextDir, "claude-plugins", "dev", ".claude-plugin", "plugin.json"),
    (manifest) => {
      manifest.version = "0.2.2";
    }
  );
  await updateJson(
    join(nextDir, "plugins", "dev", ".codex-plugin", "plugin.json"),
    (manifest) => {
      manifest.version = "0.2.2";
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
