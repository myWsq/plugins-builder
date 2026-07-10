import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const modulePath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(modulePath), "..");

export function validateReleaseTag(tag, packageVersion) {
  if (semver.valid(packageVersion) !== packageVersion) {
    throw new Error(`package.json version is not strict semver: ${packageVersion}`);
  }
  const expectedTag = `v${packageVersion}`;
  if (tag !== expectedTag) {
    throw new Error(`Release tag ${tag} must match package.json version ${expectedTag}`);
  }
  return packageVersion;
}

export async function checkTag(tag = process.env.GITHUB_REF_NAME) {
  if (!tag) throw new Error("Release tag is required");
  const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
  return validateReleaseTag(tag, packageJson.version);
}

if (resolve(process.argv[1] || "") === modulePath) {
  const version = await checkTag(process.argv[2]);
  process.stdout.write(`Release tag matches version ${version}\n`);
}
