import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

// The plugin root is wherever the marketplace entry points. The bundle directory has moved once
// already, and the gate must read the published snapshot and the candidate alike, so no layout
// prefix is assumed here — only that the entry stays inside the marketplace root.
async function resolvePluginRoot(root, name, source) {
  if (typeof source !== "string" || source === "" || isAbsolute(source)) {
    throw new Error(`Plugin ${name} must declare a relative source path: ${stableJson(source)}`);
  }
  const pluginRoot = resolve(root, source);
  const inside = relative(root, pluginRoot);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`Plugin ${name} source must stay inside the marketplace root: ${source}`);
  }
  let stat;
  try {
    stat = await lstat(pluginRoot);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Plugin ${name} source is not a directory in the marketplace: ${source}`);
  }
  return pluginRoot;
}

async function inspectMarketplace(root) {
  const marketplace = await readJson(join(root, ".claude-plugin", "marketplace.json"));
  const entries = indexEntries(marketplace.plugins, "Claude marketplace");

  const plugins = new Map();
  for (const [name, entry] of entries) {
    const pluginRoot = await resolvePluginRoot(root, name, entry.source);
    const manifest = await readJson(join(pluginRoot, ".claude-plugin", "plugin.json"));
    if (manifest.name !== name) {
      throw new Error(`Plugin manifest name mismatch for ${name}`);
    }
    if (entry.version !== manifest.version) {
      throw new Error(`Marketplace entry and plugin manifest disagree on ${name} version`);
    }
    if (semver.valid(entry.version) !== entry.version) {
      throw new Error(`Invalid strict semver for ${name}: ${entry.version}`);
    }

    const fingerprint = createHash("sha256")
      .update(stableJson(entry))
      .update("\0")
      .update(await digestTree(pluginRoot))
      .digest("hex");
    plugins.set(name, { version: entry.version, fingerprint });
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
  const removalManifest = join(nextDir, ".removed-plugins.json");
  const declaredRemovals = new Set(
    (await exists(removalManifest)) ? await readJson(removalManifest) : []
  );
  for (const name of declaredRemovals) {
    if (nextPlugins.has(name)) {
      throw new Error(`Declared removal ${name} is still present in the next marketplace`);
    }
  }
  const removed = [...currentPlugins.keys()].filter(
    (name) => !nextPlugins.has(name) && !declaredRemovals.has(name)
  );
  if (removed.length > 0) {
    throw new Error(
      `Release would remove plugin(s) without a catalog.removed declaration: ${removed.join(", ")}`
    );
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
