import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const modulePath = fileURLToPath(import.meta.url);
export const defaultProjectRoot = resolve(dirname(modulePath), "..");

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CODEX_INSTALLATION = new Set(["NOT_AVAILABLE", "AVAILABLE", "INSTALLED_BY_DEFAULT"]);
const CODEX_AUTHENTICATION = new Set(["ON_INSTALL", "ON_USE"]);

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
  requireString(plugin.displayName, `${plugin.name}.displayName`);
  requireString(plugin.description, `${plugin.name}.description`);
  requireString(plugin.shortDescription, `${plugin.name}.shortDescription`);
  requireString(plugin.longDescription, `${plugin.name}.longDescription`);
  requireString(plugin.author?.name, `${plugin.name}.author.name`);
  requireString(plugin.targets?.claude?.category, `${plugin.name}.targets.claude.category`);
  requireString(plugin.targets?.codex?.category, `${plugin.name}.targets.codex.category`);
  invariant(Array.isArray(plugin.capabilities) && plugin.capabilities.length > 0, `${plugin.name}.capabilities must be non-empty`);
  invariant(Array.isArray(plugin.defaultPrompt) && plugin.defaultPrompt.length <= 3, `${plugin.name}.defaultPrompt must contain at most 3 prompts`);
  for (const [index, prompt] of plugin.defaultPrompt.entries()) {
    requireString(prompt, `${plugin.name}.defaultPrompt[${index}]`);
    invariant(prompt.length <= 128, `${plugin.name}.defaultPrompt[${index}] exceeds 128 characters`);
  }

  const policy = plugin.targets.codex.policy;
  invariant(policy && typeof policy === "object", `${plugin.name}.targets.codex.policy is required`);
  invariant(CODEX_INSTALLATION.has(policy.installation), `invalid Codex installation policy for ${plugin.name}`);
  invariant(CODEX_AUTHENTICATION.has(policy.authentication), `invalid Codex authentication policy for ${plugin.name}`);
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

function claudePluginManifest(plugin) {
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

function codexPluginManifest(plugin) {
  return {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    author: plugin.author,
    homepage: plugin.homepage,
    repository: plugin.repository,
    license: plugin.license,
    keywords: plugin.keywords,
    skills: "./skills/",
    interface: {
      displayName: plugin.displayName,
      shortDescription: plugin.shortDescription,
      longDescription: plugin.longDescription,
      developerName: plugin.author.name,
      category: plugin.targets.codex.category,
      capabilities: plugin.capabilities,
      websiteURL: plugin.homepage,
      defaultPrompt: plugin.defaultPrompt,
      brandColor: plugin.brandColor
    }
  };
}

function generatedReadme(catalog, plugins) {
  const pluginList = plugins
    .map((plugin) => `- \`${plugin.name}\` \`v${plugin.version}\` — ${plugin.description}`)
    .join("\n");

  return `# ${catalog.name}

${catalog.description}

## Plugins

${pluginList}

## Claude Code

\`\`\`text
/plugin marketplace add myWsq/${catalog.name}
/plugin install <plugin-name>@${catalog.name}
\`\`\`

## Codex

\`\`\`bash
codex plugin marketplace add myWsq/${catalog.name}
codex plugin add <plugin-name>@${catalog.name}
\`\`\`

This repository is generated from [myWsq/plugins-builder](https://github.com/myWsq/plugins-builder).
Do not edit generated files by hand.
`;
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
  requireString(catalog.displayName, "catalog.displayName");
  requireString(catalog.description, "catalog.description");
  requireString(catalog.owner?.name, "catalog.owner.name");
  invariant(Array.isArray(catalog.plugins) && catalog.plugins.length > 0, "catalog.plugins must be non-empty");
  invariant(new Set(catalog.plugins).size === catalog.plugins.length, "catalog.plugins contains duplicate names");

  const packageJson = await readJson(join(projectRoot, "package.json"));
  const plugins = [];
  for (const name of catalog.plugins) {
    invariant(typeof name === "string" && NAME_PATTERN.test(name), `Invalid catalog plugin name: ${name}`);
    const plugin = await readJson(join(projectRoot, "catalog", "plugins", `${name}.json`));
    validatePluginDescriptor(plugin, name);
    const sourceRoot = join(projectRoot, "plugins", name);
    await assertPortableTree(sourceRoot);
    invariant(await pathExists(join(sourceRoot, "skills")), `Plugin ${name} must contain skills/`);
    plugins.push(plugin);
  }

  await mkdir(dirname(outDir), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(dirname(outDir), ".plugins-build-"));
  const temporaryRoot = join(temporaryDirectory, "root");

  try {
    await mkdir(temporaryRoot, { recursive: true });
    const claudeEntries = [];
    const codexEntries = [];

    for (const plugin of plugins) {
      const sourceRoot = join(projectRoot, "plugins", plugin.name);
      const claudeRoot = join(temporaryRoot, "claude-plugins", plugin.name);
      const codexRoot = join(temporaryRoot, "plugins", plugin.name);

      await mkdir(join(claudeRoot, ".claude-plugin"), { recursive: true });
      await mkdir(join(codexRoot, ".codex-plugin"), { recursive: true });
      await cp(join(sourceRoot, "skills"), join(claudeRoot, "skills"), { recursive: true });
      await cp(join(sourceRoot, "skills"), join(codexRoot, "skills"), { recursive: true });
      await cp(join(projectRoot, "LICENSE"), join(claudeRoot, "LICENSE"));
      await cp(join(projectRoot, "LICENSE"), join(codexRoot, "LICENSE"));
      await writeJson(join(claudeRoot, ".claude-plugin", "plugin.json"), claudePluginManifest(plugin));
      await writeJson(join(codexRoot, ".codex-plugin", "plugin.json"), codexPluginManifest(plugin));

      claudeEntries.push({
        name: plugin.name,
        source: `./claude-plugins/${plugin.name}`,
        version: plugin.version,
        description: plugin.description,
        author: plugin.author,
        category: plugin.targets.claude.category,
        homepage: plugin.homepage
      });
      codexEntries.push({
        name: plugin.name,
        source: {
          source: "local",
          path: `./plugins/${plugin.name}`
        },
        policy: plugin.targets.codex.policy,
        category: plugin.targets.codex.category
      });
    }

    await writeJson(join(temporaryRoot, ".claude-plugin", "marketplace.json"), {
      name: catalog.name,
      owner: catalog.owner,
      metadata: {
        description: catalog.description
      },
      plugins: claudeEntries
    });
    await writeJson(join(temporaryRoot, ".agents", "plugins", "marketplace.json"), {
      name: catalog.name,
      interface: {
        displayName: catalog.displayName
      },
      plugins: codexEntries
    });
    await cp(join(projectRoot, "LICENSE"), join(temporaryRoot, "LICENSE"));
    await writeFile(join(temporaryRoot, "README.md"), generatedReadme(catalog, plugins), "utf8");
    await writeJson(join(temporaryRoot, "BUILD_INFO.json"), {
      schemaVersion: 1,
      builderVersion: packageJson.version,
      sourceRevision
    });
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
