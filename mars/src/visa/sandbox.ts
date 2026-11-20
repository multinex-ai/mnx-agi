export interface SandboxOptions {
  /** Path to the agent's entry module. */
  entry: string;
  gateUrl: string;
  gateId: string;
  token: string;
  agentPublicKey: string;
  /** From `AgentKey.exportSecret()`. */
  agentSecret: string;
  timeoutMs?: number;
}

export interface SandboxResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Run an agent in a child Deno process whose runtime permissions allow one thing:
 * a network connection to the gate. No file access, no subprocesses, no other hosts,
 * no remote imports, and only five environment variables are visible. The child's
 * environment is cleared. The runtime enforces this, so the agent's code cannot widen it,
 * and `--no-prompt` makes a refused operation fail instead of asking.
 *
 * This is a policy boundary inside one runtime. It does not stop a bug in the runtime
 * itself. For untrusted code, also run the child in a container or OS sandbox.
 * The parent needs `--allow-run` and `--allow-read`.
 */
export async function runSandboxed(options: SandboxOptions): Promise<SandboxResult> {
  const gate = new URL(options.gateUrl);
  const env: Record<string, string> = {
    MARS_GATE_URL: options.gateUrl,
    MARS_GATE_ID: options.gateId,
    MARS_TOKEN: options.token,
    MARS_AGENT_PUBLIC: options.agentPublicKey,
    MARS_AGENT_SECRET: options.agentSecret,
  };
  // The runtime itself needs these to find its cache. The agent cannot read them: they are not in --allow-env.
  for (const name of ["HOME", "DENO_DIR", "XDG_CACHE_HOME", "TMPDIR"]) {
    const value = Deno.env.get(name);
    if (value !== undefined) env[name] = value;
  }
  const signal = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-prompt",
      "--no-remote",
      "--no-config",
      "--no-lock",
      `--allow-net=${gate.host}`,
      "--allow-env=MARS_GATE_URL,MARS_GATE_ID,MARS_TOKEN,MARS_AGENT_PUBLIC,MARS_AGENT_SECRET",
      options.entry,
    ],
    env,
    clearEnv: true,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
    signal,
  });
  try {
    const output = await command.output();
    return {
      code: output.code,
      stdout: new TextDecoder().decode(output.stdout),
      stderr: new TextDecoder().decode(output.stderr),
      // Deno kills the child on abort and still resolves, so check the signal, not just the exception.
      timedOut: signal.aborted,
    };
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { code: -1, stdout: "", stderr: "timed out", timedOut: true };
    }
    throw error;
  }
}
