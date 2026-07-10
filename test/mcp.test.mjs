import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { promisify } from "node:util";

import { BrokerError, createBroker } from "../plugins/dev/mcp/broker.mjs";
import { MCP_PROTOCOL_VERSION, serveStdio } from "../plugins/dev/mcp/server.mjs";

const execFileAsync = promisify(execFile);
const terminalStatuses = new Set(["completed", "failed", "canceled", "timed_out"]);

const fakeAgentSource = `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { basename } from "node:path";

const executable = basename(process.argv[1]);
const agent = executable === "cursor-agent" ? "cursor" : executable;
const args = process.argv.slice(2);

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  const nestingMarkers = [
    "CLAUDECODE",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_SESSION_ID",
    "CODEX_CI",
    "CODEX_THREAD_ID",
    "CURSOR_AGENT",
    "CURSOR_AGENT_CLI_LOCAL_MODE",
    "CURSOR_AGENT_WORKER_ID",
    "CURSOR_CLI",
    "CURSOR_CONVERSATION_ID"
  ].filter((key) => process.env[key] !== undefined);
  console.log(JSON.stringify({
    type: "invocation",
    agent,
    args,
    prompt_bytes: Buffer.byteLength(prompt),
    nesting_markers: nestingMarkers,
    home: process.env.HOME,
    cursor_auth_present: Boolean(process.env.CURSOR_API_KEY)
  }));
  if (prompt.includes("[fail]")) {
    console.error(JSON.stringify({ type: "error", message: "fake agent failure" }));
    process.exitCode = 7;
    return;
  }
  if (prompt.includes("[burst]")) {
    for (let index = 0; index < 20; index += 1) {
      console.log(JSON.stringify({ type: "event", index }));
    }
    return;
  }
  if (prompt.includes("[tree]")) {
    process.on("SIGTERM", () => {});
    const descendant = spawn(
      process.execPath,
      ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
      { stdio: "ignore" }
    );
    console.log(JSON.stringify({ type: "tree", descendant_pid: descendant.pid }));
    setInterval(() => {}, 1000);
    return;
  }
  if (prompt.includes("[hang]")) {
    setInterval(() => {}, 1000);
    return;
  }
  console.log(JSON.stringify({ type: "result", ok: true }));
});
`;

async function createHarness(t, brokerOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "dev-agents-test-"));
  const bin = join(root, "bin");
  const repo = join(root, "repo");
  const home = join(root, "home");
  await Promise.all([mkdir(bin), mkdir(repo), mkdir(home)]);
  const paths = {
    codex: join(bin, "codex"),
    claude: join(bin, "claude"),
    cursor: join(bin, "cursor-agent")
  };
  await Promise.all(
    Object.values(paths).map(async (path) => {
      await writeFile(path, fakeAgentSource);
      await chmod(path, 0o755);
    })
  );
  await execFileAsync("git", ["init", "-q", "--initial-branch=main", repo]);

  const env = {
    ...process.env,
    HOME: home,
    CLAUDECODE: "1",
    CLAUDE_CODE_ENTRYPOINT: "fake-host",
    CLAUDE_CODE_SESSION_ID: "fake-claude-session",
    CODEX_CI: "1",
    CODEX_THREAD_ID: "fake-codex-thread",
    CURSOR_AGENT: "1",
    CURSOR_AGENT_CLI_LOCAL_MODE: "true",
    CURSOR_AGENT_WORKER_ID: "fake-cursor-worker",
    CURSOR_CLI: "1",
    CURSOR_CONVERSATION_ID: "fake-cursor-conversation",
    CURSOR_API_KEY: "fake-auth-value",
    DEV_AGENT_CODEX_PATH: paths.codex,
    DEV_AGENT_CLAUDE_PATH: paths.claude,
    DEV_AGENT_CURSOR_PATH: paths.cursor
  };
  const broker = createBroker({
    env,
    home,
    gitTimeoutMs: 1_000,
    defaultRunTimeoutMs: 2_000,
    killGraceMs: 30,
    ...brokerOptions
  });
  t.after(async () => {
    await broker.shutdown();
    await rm(root, { recursive: true, force: true });
  });
  return { root, repo, home, paths, env, broker };
}

async function collectRun(broker, runId, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  let after = 0;
  const events = [];
  while (Date.now() < deadline) {
    const result = await broker.delegateGet({
      run_id: runId,
      after,
      wait_ms: 100,
      max_events: 100
    });
    events.push(...result.events);
    after = result.next_after;
    if (terminalStatuses.has(result.status) && result.finished_at) return { ...result, events };
  }
  throw new Error(`Run ${runId} did not finish in time`);
}

async function waitForTreePid(broker, runId, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  let after = 0;
  while (Date.now() < deadline) {
    const result = await broker.delegateGet({ run_id: runId, after, wait_ms: 100, max_events: 100 });
    after = result.next_after;
    for (const event of result.events) {
      if (event.stream !== "stdout") continue;
      const value = JSON.parse(event.data);
      if (value.type === "tree") return value.descendant_pid;
    }
  }
  throw new Error("Fake agent did not spawn its descendant in time");
}

async function assertProcessGone(pid, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  assert.fail(`Descendant process ${pid} survived process-group cancellation`);
}

test("agents_list checks only whether allowlisted local agent executables are installed", async (t) => {
  const { broker, env, paths, repo } = await createHarness(t);
  const detected = await broker.agentsList();

  assert.equal(detected.execution_mode, "fixed_unattended");
  assert.deepEqual(
    detected.agents.map(({ id, installed, available }) => ({
      id,
      installed,
      available
    })),
    ["codex", "claude", "cursor"].map((id) => ({
      id,
      installed: true,
      available: true
    }))
  );
  assert.ok(detected.agents.every((agent) => agent.status === "ready"));
  assert.ok(detected.agents.every((agent) => !("authenticated" in agent)));
  assert.ok(detected.agents.every((agent) => !("version" in agent)));

  const missing = createBroker({
    env: { ...env, DEV_AGENT_CURSOR_PATH: join(repo, "missing-cursor") },
    home: join(repo, "unused-home"),
    gitTimeoutMs: 1_000
  });
  t.after(() => missing.shutdown());
  const second = await missing.agentsList();
  assert.equal(second.agents.find((agent) => agent.id === "cursor").installed, false);
  assert.equal(second.agents.find((agent) => agent.id === "cursor").available, false);
  assert.equal(second.agents.find((agent) => agent.id === "cursor").status, "unavailable");
  assert.equal(second.agents.find((agent) => agent.id === "codex").path, await realpath(paths.codex));
});

test("an installed but unusable agent is discovered, then fails asynchronously", async (t) => {
  const { broker, repo } = await createHarness(t);
  const detected = await broker.agentsList();
  assert.equal(detected.agents.find((agent) => agent.id === "codex").status, "ready");

  const started = await broker.delegateStart({
    agent_id: "codex",
    cwd: repo,
    prompt: "[fail]",
    confirmed_unattended: true
  });
  const failed = await collectRun(broker, started.run_id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.exit_code, 7);
  assert.equal(failed.error, "Agent exited with code 7");
  assert.ok(failed.events.some((event) => event.stream === "stderr"));
});

test("delegate_start sends a Codex yolo invocation through stdin and completes asynchronously", async (t) => {
  const { broker, repo, home } = await createHarness(t);
  const secretPrompt = "implement the plan SECRET_PROMPT_SENTINEL";
  const started = await broker.delegateStart({
    agent_id: "codex",
    cwd: repo,
    prompt: secretPrompt,
    confirmed_unattended: true
  });

  assert.equal(started.status, "running");
  assert.equal(started.full_access, true);
  const canonicalRepo = await realpath(repo);
  const completed = await collectRun(broker, started.run_id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.exit_code, 0);

  const invocation = completed.events
    .filter((event) => event.stream === "stdout")
    .map((event) => JSON.parse(event.data))
    .find((event) => event.type === "invocation");
  assert.deepEqual(invocation.args, [
    "exec",
    "-",
    "-C",
    canonicalRepo,
    "--dangerously-bypass-approvals-and-sandbox",
    "--ephemeral",
    "--json"
  ]);
  assert.equal(invocation.prompt_bytes, Buffer.byteLength(secretPrompt));
  assert.deepEqual(invocation.nesting_markers, []);
  assert.equal(invocation.home, home);
  assert.equal(invocation.cursor_auth_present, true);
  assert.equal(JSON.stringify(completed.events).includes(secretPrompt), false);
});

test("Claude and Cursor adapters use fixed unattended flags and truthful permission modes", async (t) => {
  const { broker, repo } = await createHarness(t);
  const cases = [
    [
      "claude",
      [
        "-p",
        "--dangerously-skip-permissions",
        "--no-session-persistence",
        "--output-format",
        "stream-json",
        "--verbose"
      ]
    ],
    [
      "cursor",
      [
        "-p",
        "--yolo",
        "--sandbox",
        "enabled",
        "--output-format",
        "stream-json",
        "--trust"
      ]
    ]
  ];

  for (const [agent, expectedArgs] of cases) {
    const started = await broker.delegateStart({
      agent_id: agent,
      cwd: repo,
      prompt: "implement",
      confirmed_unattended: true
    });
    const completed = await collectRun(broker, started.run_id);
    assert.equal(started.full_access, agent === "claude");
    assert.equal(
      started.execution_mode,
      agent === "claude" ? "full_access_unattended" : "workspace_sandbox_unattended"
    );
    const invocation = completed.events
      .filter((event) => event.stream === "stdout")
      .map((event) => JSON.parse(event.data))
      .find((event) => event.type === "invocation");
    assert.deepEqual(invocation.args, expectedArgs);
  }
});

test("delegate_start rejects a run without explicit unattended-execution consent", async (t) => {
  const { broker, repo } = await createHarness(t);
  await assert.rejects(
    broker.delegateStart({ agent_id: "codex", cwd: repo, prompt: "work" }),
    (error) =>
      error instanceof BrokerError && error.code === "unattended_confirmation_required"
  );
});

test("model values and tool arguments are validated strictly", async (t) => {
  const { broker, repo } = await createHarness(t);
  for (const model of ["--config", "bad\nmodel"]) {
    await assert.rejects(
      broker.delegateStart({
        agent_id: "codex",
        cwd: repo,
        prompt: "work",
        model,
        confirmed_unattended: true
      }),
      (error) => error instanceof BrokerError && error.code === "invalid_arguments"
    );
  }
  await assert.rejects(
    broker.delegateGet({ run_id: "missing", wait: 100 }),
    (error) => error instanceof BrokerError && error.code === "invalid_arguments"
  );
  await assert.rejects(
    broker.agentsList({ refresh: true }),
    (error) => error instanceof BrokerError && error.code === "invalid_arguments"
  );
});

test("a worktree allows only one active writer", async (t) => {
  const { broker, repo } = await createHarness(t);
  const first = await broker.delegateStart({
    agent_id: "claude",
    cwd: repo,
    prompt: "[hang]",
    confirmed_unattended: true
  });
  await assert.rejects(
    broker.delegateStart({
      agent_id: "cursor",
      cwd: repo,
      prompt: "second writer",
      confirmed_unattended: true
    }),
    (error) => error instanceof BrokerError && error.code === "cwd_busy"
  );
  const canceled = await broker.delegateCancel({ run_id: first.run_id });
  assert.equal(canceled.status, "canceling");
  await collectRun(broker, first.run_id);
});

test("run deadlines and idempotent cancellation terminate fake-agent process groups", async (t) => {
  const { broker, repo } = await createHarness(t);
  const timed = await broker.delegateStart({
    agent_id: "cursor",
    cwd: repo,
    prompt: "[hang]",
    timeout_ms: 50,
    confirmed_unattended: true
  });
  const timedResult = await collectRun(broker, timed.run_id);
  assert.equal(timedResult.status, "timed_out");

  const cancellable = await broker.delegateStart({
    agent_id: "codex",
    cwd: repo,
    prompt: "[tree]",
    timeout_ms: 2_000,
    confirmed_unattended: true
  });
  const descendantPid = await waitForTreePid(broker, cancellable.run_id);
  const firstCancel = await broker.delegateCancel({ run_id: cancellable.run_id });
  const secondCancel = await broker.delegateCancel({ run_id: cancellable.run_id });
  assert.equal(firstCancel.cancellation_requested, true);
  assert.equal(secondCancel.cancellation_requested, false);
  const canceledResult = await collectRun(broker, cancellable.run_id);
  assert.equal(canceledResult.status, "canceled");
  await assertProcessGone(descendantPid);
});

test("the first repository is pinned while its linked worktrees remain allowed", async (t) => {
  const { broker, repo, root } = await createHarness(t);
  const linked = join(root, "linked");
  const unrelated = join(root, "unrelated");
  await execFileAsync(
    "git",
    [
      "-C",
      repo,
      "-c",
      "user.name=Dev Agents Test",
      "-c",
      "user.email=dev-agents@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "initial"
    ]
  );
  await execFileAsync("git", ["-C", repo, "worktree", "add", "-q", "-b", "linked-test", linked]);
  await mkdir(unrelated);
  await execFileAsync("git", ["init", "-q", "--initial-branch=main", unrelated]);

  const first = await broker.delegateStart({
    agent_id: "codex",
    cwd: repo,
    prompt: "first",
    confirmed_unattended: true
  });
  await collectRun(broker, first.run_id);
  const second = await broker.delegateStart({
    agent_id: "codex",
    cwd: linked,
    prompt: "linked",
    confirmed_unattended: true
  });
  assert.equal((await collectRun(broker, second.run_id)).status, "completed");
  await assert.rejects(
    broker.delegateStart({
      agent_id: "codex",
      cwd: unrelated,
      prompt: "wrong repository",
      confirmed_unattended: true
    }),
    (error) => error instanceof BrokerError && error.code === "repository_mismatch"
  );
});

test("incremental output keeps a capped event window", async (t) => {
  const { broker, repo } = await createHarness(t, { maxEvents: 4 });
  const started = await broker.delegateStart({
    agent_id: "codex",
    cwd: repo,
    prompt: "[burst]",
    confirmed_unattended: true
  });
  const completed = await collectRun(broker, started.run_id);
  assert.equal(completed.status, "completed");
  const window = await broker.delegateGet({ run_id: started.run_id, after: 0, max_events: 100 });
  assert.equal(window.events.length, 4);
  assert.equal(window.truncated, true);
  assert.ok(window.first_available > 1);
});

test("finished run retention is bounded", async (t) => {
  const { broker, repo } = await createHarness(t, { maxRetainedRuns: 1 });
  const first = await broker.delegateStart({
    agent_id: "codex",
    cwd: repo,
    prompt: "first",
    confirmed_unattended: true
  });
  await collectRun(broker, first.run_id);
  const second = await broker.delegateStart({
    agent_id: "codex",
    cwd: repo,
    prompt: "second",
    confirmed_unattended: true
  });
  await collectRun(broker, second.run_id);

  await assert.rejects(
    broker.delegateGet({ run_id: first.run_id }),
    (error) => error instanceof BrokerError && error.code === "run_not_found"
  );
  assert.equal((await broker.delegateGet({ run_id: second.run_id })).status, "completed");
});

test("stdio server speaks newline-delimited MCP initialize, ping, tools/list, and tools/call", async () => {
  const broker = {
    async agentsList() {
      return { execution_mode: "fixed_unattended", agents: [] };
    },
    async delegateStart() {
      throw new Error("not used");
    },
    async delegateGet() {
      throw new Error("not used");
    },
    async delegateCancel() {
      throw new Error("not used");
    },
    async shutdown() {}
  };
  const requests = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "test-version" } },
    { jsonrpc: "2.0", id: 2, method: "ping" },
    { jsonrpc: "2.0", id: 3, method: "tools/list" },
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "agents_list", arguments: {} }
    }
  ];
  const input = Readable.from(requests.map((request) => `${JSON.stringify(request)}\n`));
  let outputText = "";
  const output = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, callback) {
      outputText += chunk.toString();
      callback();
    }
  });

  await serveStdio({ input, output, broker });
  const responses = outputText
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .sort((left, right) => left.id - right.id);
  assert.deepEqual(responses.map((response) => response.id), [1, 2, 3, 4]);
  assert.equal(responses[0].result.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.deepEqual(responses[1].result, {});
  assert.deepEqual(
    responses[2].result.tools.map((tool) => tool.name),
    ["agents_list", "delegate_start", "delegate_get", "delegate_cancel"]
  );
  assert.deepEqual(responses[3].result.structuredContent.agents, []);
  assert.equal(responses[2].result.tools[0].annotations.readOnlyHint, true);
  assert.equal(responses[2].result.tools[1].annotations.destructiveHint, true);
});

test("stdio MCP dispatch remains responsive while delegate_get is long-polling", async () => {
  let releaseGet;
  let cancelCalled = false;
  const broker = {
    async agentsList() {
      return {};
    },
    async delegateStart() {
      return {};
    },
    async delegateGet() {
      return new Promise((resolveGet) => {
        releaseGet = resolveGet;
      });
    },
    async delegateCancel() {
      cancelCalled = true;
      releaseGet({ run_id: "run-1", status: "canceled", events: [] });
      return { run_id: "run-1", status: "canceling" };
    },
    async shutdown() {}
  };
  const requests = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "delegate_get", arguments: { run_id: "run-1", wait_ms: 30000 } }
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "delegate_cancel", arguments: { run_id: "run-1" } }
    }
  ];
  const input = Readable.from(requests.map((request) => `${JSON.stringify(request)}\n`));
  let outputText = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      outputText += chunk.toString();
      callback();
    }
  });

  await Promise.race([
    serveStdio({ input, output, broker }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("MCP dispatch deadlocked")), 500))
  ]);
  assert.equal(cancelCalled, true);
  assert.deepEqual(
    outputText
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).id)
      .sort(),
    [1, 2]
  );
});
