import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const execute = promisify(execFile);
const check = (condition, message) => { if (!condition) throw new Error(message); };

export function validateExternalDescriptor(descriptor) {
  check(Object.keys(descriptor).every(key => ['name', 'category', 'origin'].includes(key)),
    'External descriptor accepts only name, category and origin; metadata belongs in upstream plugin.json');
  const origin = descriptor.origin;
  check(origin && typeof origin === 'object' && !Array.isArray(origin), 'origin must be an object');
  check(Object.keys(origin).every(key => ['repository', 'path', 'ref', 'sha'].includes(key)), 'Unknown origin field');
  check(typeof descriptor.category === 'string' && descriptor.category.trim(), 'External category is required');
  check(typeof origin.repository === 'string', 'origin.repository is required');
  const https = /^https:\/\/[^/]+\/.+/.test(origin.repository);
  const ssh = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+$/.test(origin.repository);
  check(https || ssh, 'origin.repository must be a credential-free HTTPS or git@host:path URL');
  if (https) {
    const url = new URL(origin.repository);
    check(!url.username && !url.password && !url.search && !url.hash, 'Repository URL must not contain credentials, query or fragment');
  }
  check(typeof origin.path === 'string' && (origin.path === '.' ||
    origin.path.split('/').every(part => /^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/.test(part) && !['.', '..'].includes(part))),
  'origin.path must be . or a portable relative directory without traversal');
  check(typeof origin.sha === 'string' && /^[0-9a-f]{40}$/.test(origin.sha), 'origin.sha must be a full lowercase 40-character commit SHA');
  check(origin.ref === undefined || (typeof origin.ref === 'string' && origin.ref.trim() && !/[\r\n\0]/.test(origin.ref)), 'origin.ref must be a non-empty label');
}

async function git(args, cwd, repository, binary = false) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' };
  // Restrict the optional token to github.com HTTPS sources. Never place it in argv or files.
  if (process.env.PLUGIN_SOURCE_TOKEN && repository?.startsWith('https://github.com/')) {
    const index = Number(env.GIT_CONFIG_COUNT || 0);
    env.GIT_CONFIG_COUNT = String(index + 1);
    env[`GIT_CONFIG_KEY_${index}`] = 'http.https://github.com/.extraheader';
    env[`GIT_CONFIG_VALUE_${index}`] = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.PLUGIN_SOURCE_TOKEN}`).toString('base64')}`;
  }
  try {
    const result = await execute('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd, env, encoding: binary ? 'buffer' : 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024
    });
    return binary ? result.stdout : result.stdout.trim();
  } catch {
    // Git errors may include credentials from credential helpers or URL rewrites.
    throw new Error(`External Git ${args[0]} failed; check repository access and pinned SHA`);
  }
}

export async function fetchExternalPlugin(descriptor, destination) {
  validateExternalDescriptor(descriptor);
  const { origin } = descriptor;
  const temporary = await mkdtemp(join(tmpdir(), 'plugin-source-'));
  try {
    await git(['init', '--bare', 'repository'], temporary);
    const repository = join(temporary, 'repository');
    await git(['fetch', '--depth=1', '--no-tags', origin.repository, origin.sha], repository, origin.repository);
    const actual = await git(['rev-parse', 'FETCH_HEAD^{commit}'], repository);
    check(actual === origin.sha, 'Fetched revision does not match origin.sha');
    const tree = origin.path === '.' ? `${origin.sha}^{tree}` : `${origin.sha}:${origin.path}`;
    check(await git(['cat-file', '-t', tree], repository) === 'tree', 'origin.path must identify a Git directory');
    const entries = new TextDecoder('utf-8', { fatal: true }).decode(
      await git(['ls-tree', '-r', '-z', tree], repository, undefined, true));
    const files = [];
    for (const entry of entries.split('\0').filter(Boolean)) {
      const match = /^(\d+) \S+ ([0-9a-f]+)\t([\s\S]+)$/.exec(entry);
      check(match && ['100644', '100755'].includes(match[1]), 'External plugins cannot contain symlinks or submodules');
      const path = match[3];
      check(path.split('/').every(part => part && part !== '.' && part !== '..' && !part.includes('\\')), 'Non-portable external file path');
      files.push({path, mode: match[1], blob: match[2]});
      check(!path.split('/').some(part => /^(?:\.git|\.env(?:\..*)?|\.npmrc|\.netrc|\.ssh)$/i.test(part)),
        `Forbidden file in external plugin: ${path}`);
    }
    // Read raw blobs: no checkout filters, Git hooks, line-ending conversion or build scripts.
    await mkdir(destination, { recursive: true });
    for (const file of files) {
      const target = join(destination, file.path);
      await mkdir(dirname(target), { recursive: true });
      const content = await git(['cat-file', 'blob', file.blob], repository, undefined, true);
      check(!content.subarray(0, 100).toString().startsWith('version https://git-lfs.github.com/spec/v1'),
        `Git LFS pointers are not deliverable plugin files: ${file.path}`);
      await writeFile(target, content);
      await chmod(target, file.mode === '100755' ? 0o755 : 0o644);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function validateExternalBundle(root, expectedName) {
  const manifest = JSON.parse(await readFile(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  check(manifest.name === expectedName, 'External manifest name must match catalog name');
  check((await lstat(join(root, 'LICENSE'))).isFile(), 'External plugin must include LICENSE');
  const names = await readdir(root);
  if (names.includes('hooks')) JSON.parse(await readFile(join(root, 'hooks', 'hooks.json'), 'utf8'));
  if (names.includes('.mcp.json')) JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8'));
  if (names.includes('.lsp.json')) JSON.parse(await readFile(join(root, '.lsp.json'), 'utf8'));
  return manifest;
}
