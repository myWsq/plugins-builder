import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const modulePath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(modulePath), "..");

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to load JSON ${path}: ${error.message}`, { cause: error });
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function indexEntries(entries, label) {
  if (!Array.isArray(entries)) throw new Error(`${label}.plugins must be an array`);
  const result = new Map();
  for (const entry of entries) {
    if (typeof entry?.name !== "string" || entry.name === "") {
      throw new Error(`${label} contains a plugin without a name`);
    }
    if (result.has(entry.name)) throw new Error(`${label} contains duplicate plugin ${entry.name}`);
    result.set(entry.name, entry);
  }
  return result;
}

function sameNames(left, right) {
  return (
    left.size === right.size &&
    [...left.keys()].every((name) => right.has(name))
  );
}

async function digestTree(root) {
  const hash = createHash("sha256");

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const stat = await lstat(path);
      const name = relative(root, path);
      if (stat.isSymbolicLink()) throw new Error(`Symlink in release tree: ${name}`);
      if (stat.isDirectory()) {
        hash.update(`directory\0${name}\0`);
        await visit(path);
      } else if (stat.isFile()) {
        hash.update(`file\0${name}\0${stat.mode & 0o777}\0`);
        hash.update(await readFile(path));
        hash.update("\0");
      } else {
        throw new Error(`Unsupported entry in release tree: ${name}`);
      }
    }
  }

  await visit(root);
  return hash.digest("hex");
}

async function directoryNames(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const names = new Set();
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`Unexpected entry in plugin collection: ${join(path, entry.name)}`);
    }
    names.add(entry.name);
  }
  return names;
}

async function inspectMarketplace(root) {
  const claudeMarketplace = await readJson(join(root, ".claude-plugin", "marketplace.json"));
  const codexMarketplace = await readJson(join(root, ".agents", "plugins", "marketplace.json"));
  const claudeEntries = indexEntries(claudeMarketplace.plugins, "Claude marketplace");
  const codexEntries = indexEntries(codexMarketplace.plugins, "Codex marketplace");
  if (!sameNames(claudeEntries, codexEntries)) {
    throw new Error("Claude and Codex marketplaces must contain the same plugin names");
  }

  const expectedNames = new Set(claudeEntries.keys());
  const claudeDirectories = await directoryNames(join(root, "claude-plugins"));
  const codexDirectories = await directoryNames(join(root, "plugins"));
  if (!sameNames(expectedNames, claudeDirectories)) {
    throw new Error("Claude plugin directories do not match marketplace entries");
  }
  if (!sameNames(expectedNames, codexDirectories)) {
    throw new Error("Codex plugin directories do not match marketplace entries");
  }

  const plugins = new Map();
  for (const name of expectedNames) {
    const claudeEntry = claudeEntries.get(name);
    const codexEntry = codexEntries.get(name);
    if (claudeEntry.source !== `./claude-plugins/${name}`) {
      throw new Error(`Unexpected Claude source for ${name}: ${stableJson(claudeEntry.source)}`);
    }
    if (
      codexEntry.source?.source !== "local" ||
      codexEntry.source?.path !== `./plugins/${name}`
    ) {
      throw new Error(`Unexpected Codex source for ${name}: ${stableJson(codexEntry.source)}`);
    }

    const claudeRoot = join(root, "claude-plugins", name);
    const codexRoot = join(root, "plugins", name);
    const claudeManifest = await readJson(join(claudeRoot, ".claude-plugin", "plugin.json"));
    const codexManifest = await readJson(join(codexRoot, ".codex-plugin", "plugin.json"));
    if (claudeManifest.name !== name || codexManifest.name !== name) {
      throw new Error(`Plugin manifest name mismatch for ${name}`);
    }
    const versions = [claudeEntry.version, claudeManifest.version, codexManifest.version];
    if (!versions.every((version) => version === versions[0])) {
      throw new Error(`Claude entry and plugin manifests disagree on ${name} version`);
    }
    if (semver.valid(versions[0]) !== versions[0]) {
      throw new Error(`Invalid strict semver for ${name}: ${versions[0]}`);
    }

    const fingerprint = createHash("sha256")
      .update(stableJson(claudeEntry))
      .update("\0")
      .update(stableJson(codexEntry))
      .update("\0")
      .update(await digestTree(claudeRoot))
      .update("\0")
      .update(await digestTree(codexRoot))
      .digest("hex");
    plugins.set(name, { version: versions[0], fingerprint });
  }
  return plugins;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--current") {
      options.currentDir = argv[index + 1];
      if (!options.currentDir) throw new Error("--current requires a path");
      index += 1;
    } else if (argument === "--next") {
      options.nextDir = argv[index + 1];
      if (!options.nextDir) throw new Error("--next requires a path");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

export async function checkRelease({
  currentDir = resolve(projectRoot, "..", "plugins"),
  nextDir = join(projectRoot, "dist")
} = {}) {
  currentDir = resolve(currentDir);
  nextDir = resolve(nextDir);
  if (!(await exists(join(currentDir, ".generated-by-plugins-builder")))) {
    throw new Error(
      `Current marketplace is not managed by plugins-builder: ${currentDir}. Bootstrap it from a verified local build before the first tag.`
    );
  }
  if (!(await exists(join(nextDir, ".generated-by-plugins-builder")))) {
    throw new Error(`Next marketplace is not generated by plugins-builder: ${nextDir}`);
  }

  const currentPlugins = await inspectMarketplace(currentDir);
  const nextPlugins = await inspectMarketplace(nextDir);
  const removed = [...currentPlugins.keys()].filter((name) => !nextPlugins.has(name));
  if (removed.length > 0) {
    throw new Error(`Release would remove plugin(s): ${removed.join(", ")}`);
  }

  for (const [name, next] of nextPlugins) {
    const current = currentPlugins.get(name);
    if (!current) continue;
    const versionOrder = semver.compare(next.version, current.version);
    if (versionOrder < 0) {
      throw new Error(`${name} version regressed from ${current.version} to ${next.version}`);
    }
    if (next.fingerprint !== current.fingerprint && versionOrder === 0) {
      throw new Error(
        `${name} release payload changed without a version bump (still ${next.version})`
      );
    }
  }

  return {
    currentDir,
    nextDir,
    pluginCount: nextPlugins.size
  };
}

if (resolve(process.argv[1] || "") === modulePath) {
  const result = await checkRelease(parseArgs(process.argv.slice(2)));
  process.stdout.write(`Release check passed for ${result.pluginCount} plugin(s)\n`);
}
