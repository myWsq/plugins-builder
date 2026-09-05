import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const modulePath = fileURLToPath(import.meta.url);
export const defaultProjectRoot = resolve(dirname(modulePath), "..");

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// The compiler once rendered per-target blocks for a second bundle. Those markers are retired: the
// build ships one Claude Code bundle, so a leftover marker is a source error, never shipped text.
const RETIRED_TARGET_DIRECTIVE_PATTERN = /<!--[\t ]*\/?(?:claude|codex)[\t ]*-->/;
const FRAGMENT_FILE_PATTERN = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const INCLUDE_DIRECTIVE_PATTERN = /^[\t ]*<!--[\t ]*include[\t ]+([a-z0-9]+(?:-[a-z0-9]+)*)[\t ]*-->[\t ]*$/;
const KNOWN_INCLUDE_DIRECTIVE_PATTERN = /<!--[\t ]*include\b.*-->/;

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readJson(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${path}: ${error.message}`, { cause: error });
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error.message}`, { cause: error });
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function requireString(value, field) {
  invariant(typeof value === "string" && value.trim() !== "", `${field} must be a non-empty string`);
}

export function validatePluginDescriptor(plugin, expectedName = plugin?.name) {
  invariant(plugin && typeof plugin === "object" && !Array.isArray(plugin), "plugin descriptor must be an object");
  requireString(plugin.name, "plugin.name");
  invariant(NAME_PATTERN.test(plugin.name), `plugin.name must be kebab-case: ${plugin.name}`);
  invariant(plugin.name === expectedName, `plugin descriptor name ${plugin.name} must match catalog name ${expectedName}`);
  requireString(plugin.version, `${plugin.name}.version`);
  invariant(semver.valid(plugin.version) === plugin.version, `${plugin.name}.version must be strict semver`);
  requireString(plugin.description, `${plugin.name}.description`);
  requireString(plugin.author?.name, `${plugin.name}.author.name`);
  requireString(plugin.category, `${plugin.name}.category`);
}

export async function assertPortableTree(root) {
  const rootStat = await lstat(root);
  invariant(rootStat.isDirectory(), `Expected a directory: ${root}`);

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const stat = await lstat(path);
      const displayPath = relative(root, path);
      invariant(!stat.isSymbolicLink(), `Symlinks are not allowed in plugin source: ${displayPath}`);
      invariant(stat.isDirectory() || stat.isFile(), `Unsupported filesystem entry in plugin source: ${displayPath}`);
      if (stat.isDirectory()) {
        await visit(path);
      }
    }
  }

  await visit(root);
}

export function expandSkillFragments(text, fragments, sourcePath = "Markdown source") {
  const output = [];
  for (const line of text.split(/(?<=\n)/)) {
    const content = line.endsWith("\n")
      ? line.slice(0, line.endsWith("\r\n") ? -2 : -1)
      : line;
    const directive = content.match(INCLUDE_DIRECTIVE_PATTERN);
    if (!directive) {
      invariant(
        !KNOWN_INCLUDE_DIRECTIVE_PATTERN.test(content),
        `Invalid fragment include in ${sourcePath}: includes must occupy their own line and use a kebab-case name`
      );
      output.push(line);
      continue;
    }

    const name = directive[1];
    invariant(fragments.has(name), `Unknown skill fragment ${name} referenced by ${sourcePath}`);
    output.push(fragments.get(name));
  }
  return output.join("");
}

function assertNoRetiredDirectives(text, sourcePath) {
  invariant(
    !RETIRED_TARGET_DIRECTIVE_PATTERN.test(text),
    `Retired target directive in ${sourcePath}: per-target blocks are no longer supported, remove the marker`
  );
}

async function loadSkillFragments(sourceRoot) {
  const fragmentsRoot = join(sourceRoot, "fragments");
  if (!(await pathExists(fragmentsRoot))) return new Map();
  const fragmentsStat = await lstat(fragmentsRoot);
  invariant(fragmentsStat.isDirectory(), `Skill fragments path must be a directory: ${fragmentsRoot}`);
  const fragments = new Map();
  const entries = await readdir(fragmentsRoot, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const match = entry.name.match(FRAGMENT_FILE_PATTERN);
    invariant(
      entry.isFile() && match,
      `Skill fragments must be flat kebab-case Markdown files: ${join(fragmentsRoot, entry.name)}`
    );
    const path = join(fragmentsRoot, entry.name);
    const text = await readFile(path, "utf8");
    invariant(text.endsWith("\n"), `Skill fragment must end with a newline: ${path}`);
    invariant(
      !RETIRED_TARGET_DIRECTIVE_PATTERN.test(text) && !KNOWN_INCLUDE_DIRECTIVE_PATTERN.test(text),
      `Skill fragment must not contain target or include directives: ${path}`
    );
    fragments.set(match[1], text);
  }
  return fragments;
}

async function renderSkillTree(sourceRoot, destinationRoot, fragments) {
  await cp(sourceRoot, destinationRoot, { recursive: true });

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const text = await readFile(path, "utf8");
        const sourcePath = join(sourceRoot, relative(destinationRoot, path));
        assertNoRetiredDirectives(text, sourcePath);
        const rendered = expandSkillFragments(text, fragments, sourcePath);
        if (rendered !== text) await writeFile(path, rendered, "utf8");
      }
    }
  }

  await visit(destinationRoot);
}

function pluginManifest(plugin) {
  return {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    author: plugin.author,
    homepage: plugin.homepage,
    repository: plugin.repository,
    license: plugin.license,
    keywords: plugin.keywords
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--out") {
      options.outDir = argv[index + 1];
      invariant(options.outDir, "--out requires a path");
      index += 1;
    } else if (argument === "--source-revision") {
      options.sourceRevision = argv[index + 1];
      invariant(options.sourceRevision, "--source-revision requires a value");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

export async function build({
  projectRoot = defaultProjectRoot,
  outDir = join(projectRoot, "dist"),
  sourceRevision = process.env.SOURCE_REVISION || "working-tree"
} = {}) {
  projectRoot = resolve(projectRoot);
  outDir = resolve(outDir);
  invariant(outDir !== projectRoot, "Output directory must not be the builder repository root");
  invariant(outDir !== dirname(projectRoot), "Output directory must not be the builder repository parent");
  invariant(!(await pathExists(join(outDir, ".git"))), `Refusing to replace Git repository: ${outDir}`);

  const catalog = await readJson(join(projectRoot, "catalog", "marketplace.json"));
  requireString(catalog.name, "catalog.name");
  invariant(NAME_PATTERN.test(catalog.name), "catalog.name must be kebab-case");
  requireString(catalog.description, "catalog.description");
  requireString(catalog.owner?.name, "catalog.owner.name");
  invariant(Array.isArray(catalog.plugins) && catalog.plugins.length > 0, "catalog.plugins must be non-empty");
  invariant(new Set(catalog.plugins).size === catalog.plugins.length, "catalog.plugins contains duplicate names");

  const removedPlugins = catalog.removed ?? [];
  invariant(Array.isArray(removedPlugins), "catalog.removed must be an array when present");
  invariant(new Set(removedPlugins).size === removedPlugins.length, "catalog.removed contains duplicate names");
  for (const name of removedPlugins) {
    invariant(typeof name === "string" && NAME_PATTERN.test(name), `Invalid catalog.removed plugin name: ${name}`);
    invariant(!catalog.plugins.includes(name), `catalog.removed conflicts with an active plugin: ${name}`);
  }

  const packageJson = await readJson(join(projectRoot, "package.json"));
  const docsRoot = join(projectRoot, "docs");
  const marketReadme = join(projectRoot, "MARKET_README.md");
  invariant(await pathExists(docsRoot), "Marketplace documentation directory docs/ is required");
  invariant(await pathExists(marketReadme), "MARKET_README.md is required");
  await assertPortableTree(docsRoot);
  const plugins = [];
  for (const name of catalog.plugins) {
    invariant(typeof name === "string" && NAME_PATTERN.test(name), `Invalid catalog plugin name: ${name}`);
    const plugin = await readJson(join(projectRoot, "catalog", "plugins", `${name}.json`));
    validatePluginDescriptor(plugin, name);
    const sourceRoot = join(projectRoot, "plugins", name);
    await assertPortableTree(sourceRoot);
    invariant(await pathExists(join(sourceRoot, "skills")), `Plugin ${name} must contain skills/`);
    if (await pathExists(join(sourceRoot, "hooks"))) {
      await readJson(join(sourceRoot, "hooks", "hooks.json"));
    }
    plugins.push(plugin);
  }

  await mkdir(dirname(outDir), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(dirname(outDir), ".plugins-build-"));
  const temporaryRoot = join(temporaryDirectory, "root");

  try {
    await mkdir(temporaryRoot, { recursive: true });
    const entries = [];

    for (const plugin of plugins) {
      const sourceRoot = join(projectRoot, "plugins", plugin.name);
      const bundleRoot = join(temporaryRoot, "plugins", plugin.name);
      const skillFragments = await loadSkillFragments(sourceRoot);

      await mkdir(join(bundleRoot, ".claude-plugin"), { recursive: true });
      await renderSkillTree(join(sourceRoot, "skills"), join(bundleRoot, "skills"), skillFragments);
      for (const component of ["hooks", "agents"]) {
        if (await pathExists(join(sourceRoot, component))) {
          await cp(join(sourceRoot, component), join(bundleRoot, component), { recursive: true });
        }
      }
      await cp(join(projectRoot, "LICENSE"), join(bundleRoot, "LICENSE"));
      await writeJson(join(bundleRoot, ".claude-plugin", "plugin.json"), pluginManifest(plugin));

      entries.push({
        name: plugin.name,
        source: `./plugins/${plugin.name}`,
        version: plugin.version,
        description: plugin.description,
        author: plugin.author,
        category: plugin.category,
        homepage: plugin.homepage
      });
    }

    await writeJson(join(temporaryRoot, ".claude-plugin", "marketplace.json"), {
      name: catalog.name,
      owner: catalog.owner,
      metadata: {
        description: catalog.description
      },
      plugins: entries
    });
    await cp(docsRoot, join(temporaryRoot, "docs"), { recursive: true });
    await cp(join(projectRoot, "LICENSE"), join(temporaryRoot, "LICENSE"));
    await cp(marketReadme, join(temporaryRoot, "README.md"));
    await writeJson(join(temporaryRoot, "BUILD_INFO.json"), {
      schemaVersion: 1,
      builderVersion: packageJson.version,
      sourceRevision
    });
    await writeJson(join(temporaryRoot, ".removed-plugins.json"), removedPlugins);
    await writeJson(join(temporaryRoot, ".generated-by-plugins-builder"), {
      schemaVersion: 1,
      marketplace: catalog.name
    });

    await rm(outDir, { recursive: true, force: true });
    await rename(temporaryRoot, outDir);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  return { outDir, catalog, plugins };
}

if (resolve(process.argv[1] || "") === modulePath) {
  const options = parseArgs(process.argv.slice(2));
  const result = await build(options);
  process.stdout.write(`Built ${result.plugins.length} plugin(s) into ${result.outDir}\n`);
}
