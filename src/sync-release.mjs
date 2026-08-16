import { cp, lstat, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(modulePath), "..");

async function exists(path) {
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

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source") {
      options.sourceDir = argv[index + 1];
      if (!options.sourceDir) throw new Error("--source requires a path");
      index += 1;
    } else if (argument === "--target") {
      options.targetDir = argv[index + 1];
      if (!options.targetDir) throw new Error("--target requires a path");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

export async function syncRelease({ sourceDir = join(projectRoot, "dist"), targetDir } = {}) {
  if (!targetDir) {
    throw new Error("targetDir is required: name the generated checkout explicitly");
  }
  sourceDir = resolve(sourceDir);
  targetDir = resolve(targetDir);
  if (!(await exists(join(sourceDir, ".generated-by-plugins-builder")))) {
    throw new Error(`Source is not a generated marketplace: ${sourceDir}`);
  }
  if (!(await exists(join(targetDir, ".git")))) {
    throw new Error(`Target must be an initialized Git repository: ${targetDir}`);
  }

  const targetEntries = (await readdir(targetDir)).filter((entry) => entry !== ".git");
  if (targetEntries.length > 0 && !(await exists(join(targetDir, ".generated-by-plugins-builder")))) {
    throw new Error(`Refusing first sync into non-empty unmanaged repository: ${targetDir}`);
  }

  for (const entry of targetEntries) {
    await rm(join(targetDir, entry), { recursive: true, force: true });
  }
  const sourceEntries = await readdir(sourceDir);
  sourceEntries.sort();
  for (const entry of sourceEntries) {
    await cp(join(sourceDir, entry), join(targetDir, entry), { recursive: true });
  }

  return { sourceDir, targetDir };
}

if (resolve(process.argv[1] || "") === modulePath) {
  const options = parseArgs(process.argv.slice(2));
  const result = await syncRelease(options);
  process.stdout.write(`Synced ${result.sourceDir} to ${result.targetDir}\n`);
}
