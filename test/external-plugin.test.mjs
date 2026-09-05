import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build, defaultProjectRoot } from '../src/build.mjs';
import { fetchExternalPlugin, validateExternalDescriptor } from '../src/external-plugin.mjs';
import { checkRelease } from '../src/check-release.mjs';

const exec = promisify(execFile);
const json = async (path, value) => writeFile(path, JSON.stringify(value) + '\n');
const descriptor = sha => ({name: 'external', category: 'development', origin: {
  repository: 'https://example.test/team/project.git', path: 'integration/plugin', sha
}});

test('external descriptors require immutable portable credential-free sources', () => {
  const base = descriptor('a'.repeat(40));
  validateExternalDescriptor(base);
  for (const mutation of [
    {sha: 'main'}, {path: '../plugin'}, {path: '/plugin'}, {path: 'a//b'},
    {repository: 'https://token@example.test/team/repo'}, {repository: 'file:///tmp/repo'},
    {repository: 'https://example.test/repo?token=secret'}, {unknown: true}
  ]) assert.throws(() => validateExternalDescriptor({...base, origin: {...base.origin, ...mutation}}));
  assert.throws(() => validateExternalDescriptor({...base, version: '1.0.0'}));
});

test('external Git collection, native components, version gates and failure atomicity', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'external-test-'));
  const previous = process.env.GIT_CONFIG_GLOBAL;
  t.after(async () => {
    if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = previous;
    await rm(temp, {recursive: true, force: true});
  });
  const upstream = join(temp, 'upstream');
  const root = join(temp, 'project');
  await mkdir(upstream);
  await mkdir(root);
  for (const name of ['catalog', 'docs', 'plugins', 'LICENSE', 'MARKET_README.md', 'package.json']) {
    await cp(join(defaultProjectRoot, name), join(root, name), {recursive: true});
  }
  const git = async (...args) => (await exec('git', args, {cwd: upstream})).stdout.trim();
  await git('init');
  await git('config', 'user.name', 'Fixture');
  await git('config', 'user.email', 'fixture@example.test');
  // Exercise actual fetch/checkout offline via Git's standard URL rewrite configuration.
  const config = join(temp, 'gitconfig');
  await writeFile(config, `[url "${upstream}"]\n\tinsteadOf = https://example.test/team/project.git\n`);
  process.env.GIT_CONFIG_GLOBAL = config;
  const plugin = join(upstream, 'integration/plugin');
  for (const name of ['.claude-plugin', 'commands', 'hooks', 'agents', 'scripts']) await mkdir(join(plugin, name), {recursive: true});
  const manifest = {name: 'external', version: '1.0.0', description: 'External fixture', author: {name: 'Upstream'}};
  await json(join(plugin, '.claude-plugin/plugin.json'), manifest);
  await writeFile(join(plugin, 'LICENSE'), 'Upstream license\n');
  await writeFile(join(plugin, 'commands/run.md'), '# Command\n');
  await writeFile(join(plugin, 'agents/helper.md'), '# Agent\n');
  await writeFile(join(plugin, 'scripts/run.sh'), '#!/bin/sh\necho fixture\n');
  await chmod(join(plugin, 'scripts/run.sh'), 0o755);
  await json(join(plugin, 'hooks/hooks.json'), {hooks: {}});
  await json(join(plugin, '.mcp.json'), {mcpServers: {}});
  await writeFile(join(upstream, 'private-context.txt'), 'Must never ship');
  const commit = async () => {await git('add', '.'); await git('commit', '-m', 'fixture'); return git('rev-parse', 'HEAD');};
  const first = await commit();
  const entire = join(temp, 'entire');
  await fetchExternalPlugin({...descriptor(first), origin: {...descriptor(first).origin, path: '.'}}, entire);
  assert.equal(await readFile(join(entire, 'private-context.txt'), 'utf8'), 'Must never ship');
  const catalogFile = join(root, 'catalog/plugins/external.json');
  const setPin = async sha => json(catalogFile, descriptor(sha));
  await json(join(root, 'catalog/marketplace.json'), {name: 'fixture', description: 'Fixture', owner: {name: 'Fixture'}, plugins: ['external']});
  await setPin(first);
  const current = join(root, 'current');
  await build({projectRoot: root, outDir: current});
  assert.equal(await readFile(join(current, 'plugins/external/LICENSE'), 'utf8'), 'Upstream license\n');
  for (const path of ['commands/run.md', 'agents/helper.md', '.mcp.json', 'hooks/hooks.json', 'scripts/run.sh', '.claude-plugin/plugin.json']) {
    assert.deepEqual(await readFile(join(current, 'plugins/external', path)), await readFile(join(plugin, path)));
  }
  assert.equal((await lstat(join(current, 'plugins/external/scripts/run.sh'))).mode & 0o777, 0o755);
  await assert.rejects(readFile(join(current, 'plugins/external/private-context.txt')), {code: 'ENOENT'});
  await assert.rejects(readFile(join(current, 'plugins/external/.git/config')), {code: 'ENOENT'});
  const next = join(root, 'next');
  await build({projectRoot: root, outDir: next});
  await checkRelease({currentDir: current, nextDir: next});
  await writeFile(join(plugin, 'commands/run.md'), '# Changed command\n');
  const changed = await commit();
  // An upstream branch moving cannot change a pinned build.
  await build({projectRoot: root, outDir: next});
  assert.equal(await readFile(join(next, 'plugins/external/commands/run.md'), 'utf8'), '# Command\n');
  await setPin(changed);
  await build({projectRoot: root, outDir: next});
  await assert.rejects(checkRelease({currentDir: current, nextDir: next}), /version|Version/);
  manifest.version = '1.0.1';
  await json(join(plugin, '.claude-plugin/plugin.json'), manifest);
  await setPin(await commit());
  await build({projectRoot: root, outDir: next});
  await checkRelease({currentDir: current, nextDir: next});
  await json(join(plugin, '.mcp.json'), {mcpServers: {fixture: {command: 'fixture'}}});
  await setPin(await commit());
  await build({projectRoot: root, outDir: current});
  await assert.rejects(checkRelease({currentDir: next, nextDir: current}), /version|Version/);
  await symlink('../outside', join(plugin, 'escape'));
  await setPin(await commit());
  await assert.rejects(build({projectRoot: root, outDir: next}), /symlinks/);
  assert.equal(JSON.parse(await readFile(join(next, 'plugins/external/.claude-plugin/plugin.json'))).version, '1.0.1');
  await rm(join(plugin, 'escape'));
  await writeFile(join(plugin, '.env'), 'FAKE_SECRET=fixture');
  await setPin(await commit());
  await assert.rejects(build({projectRoot: root, outDir: next}), /Forbidden file/);
  await rm(join(plugin, '.env'));
  await writeFile(join(plugin, 'hooks/hooks.json'), '{invalid');
  await setPin(await commit());
  await assert.rejects(build({projectRoot: root, outDir: next}), SyntaxError);
  await json(join(plugin, 'hooks/hooks.json'), {hooks: {}});
  manifest.name = 'wrong';
  await json(join(plugin, '.claude-plugin/plugin.json'), manifest);
  await setPin(await commit());
  await assert.rejects(build({projectRoot: root, outDir: next}), /name must match/);
  await setPin('0'.repeat(40));
  await assert.rejects(build({projectRoot: root, outDir: next}), /External Git fetch failed/);
});
