import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const managedPaths = Object.freeze({
  codex: '/etc/codex/requirements.toml',
  claude: '/Library/Application Support/ClaudeCode/managed-mcp.json',
  claudeSettings: '/Library/Application Support/ClaudeCode/managed-settings.d/90-mnx-agi.json',
});

// Read-only trust check. Trust the complete canonical chain, not just a leaf
// whose owner can replace it through a writable parent directory.
export function inspectProtectedPath(target, io = fs) {
  const issues = [];
  let cursor = path.resolve(target);
  try {
    const canonical = io.realpathSync(cursor);
    // macOS ships /etc as a root-owned alias to /private/etc.
    const systemEtcAlias = cursor.startsWith('/etc/') && canonical === `/private${cursor}`;
    if (canonical !== cursor && !systemEtcAlias) issues.push('path_alias');
    if (systemEtcAlias) {
      const alias = io.lstatSync('/etc');
      if (alias.uid !== 0 || (alias.mode & 0o022 && !alias.isSymbolicLink())) issues.push('unsafe_system_alias');
    }
    cursor = canonical;
    while (true) {
      const st = io.lstatSync(cursor);
      if (st.isSymbolicLink()) issues.push('symlink');
      if (st.uid !== 0) issues.push('not_root_owned');
      if (st.mode & 0o022) issues.push('group_or_world_writable');
      const parent = path.dirname(cursor);
      if (cursor === parent) break;
      cursor = parent;
    }
  } catch { issues.push('missing_or_unreadable'); }
  return { protected: issues.length === 0, issues: [...new Set(issues)] };
}

// Preparation only. No system files are written and no existing organizational
// policy is merged or replaced. A credential-isolated broker is a prerequisite.
export function prepareManagedPolicies({ brokerExecutable }) {
  if (typeof brokerExecutable !== 'string' || !path.isAbsolute(brokerExecutable) || /[\r\n\0]/.test(brokerExecutable)) throw new Error('invalid_broker_executable');
  const quote = JSON.stringify(brokerExecutable);
  const codex = `# Prepared policy; activate only after the broker acceptance gate passes.\n` +
    `default_permissions = ":workspace"\nallowed_sandbox_modes = ["read-only", "workspace-write"]\nallowed_approval_policies = ["never", "on-request"]\nallow_managed_hooks_only = true\n\n` +
    `[allowed_permission_profiles]\n":read-only" = true\n":workspace" = true\n\n` +
    `[features]\napps = false\nplugins = false\nbrowser_use = false\nin_app_browser = false\ncomputer_use = false\n\n` +
    `[mcp_servers.mnx_memq_guard.identity]\ncommand = { executable = ${quote}, args = [] }\n\n` +
    `[experimental_network]\nenabled = true\n\n[experimental_network.domains]\n"**.multinex.ai" = "deny"\n`;
  const claude = JSON.stringify({ mcpServers: { mnx_memq_guard: { type: 'stdio', command: brokerExecutable, args: [] } } }, null, 2) + '\n';
  const claudeSettings = JSON.stringify({
    allowManagedMcpServersOnly: true,
    allowedMcpServers: [{ serverCommand: [brokerExecutable] }],
    deniedMcpServers: [{ serverUrl: '*://mcp.multinex.ai:*/*' }],
    allowManagedHooksOnly: true,
    allowAllClaudeAiMcps: false,
    allowClaudeInChromeWithManagedMcp: false,
    disableClaudeAiConnectors: true,
    permissions: { disableBypassPermissionsMode: 'disable' },
    sandbox: {
      enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false,
      network: { deniedDomains: ['multinex.ai', '*.multinex.ai'], allowAllUnixSockets: false, allowLocalBinding: false },
    },
  }, null, 2) + '\n';
  const contents = { codex, claude, claudeSettings };
  const files = Object.entries(contents).map(([name, content]) => ({ name, destination: managedPaths[name], content, sha256: crypto.createHash('sha256').update(content).digest('hex') }));
  return { schemaVersion: 1, kind: 'prepared-not-activated', brokerExecutable, files, systemSealed: false };
}

// An audit can disprove readiness; file presence can never prove runtime
// isolation. Keep missing acceptance gates explicit, including the distinction
// between two account emails and two authenticated security namespaces.
export function auditEnforcement({ brokerExecutable, evidence = {}, io = fs, now = Date.now() }) {
  const gates = [];
  const gate = (name, ok) => gates.push({ name, passed: ok === true });
  for (const [name, target] of Object.entries(managedPaths)) gate(`${name}_protected`, inspectProtectedPath(target, io).protected);
  gate('broker_protected', typeof brokerExecutable === 'string' && inspectProtectedPath(brokerExecutable, io).protected);
  gate('credential_isolation', evidence.credentialIsolation === true);
  gate('host_policy_observed', evidence.codexPolicyObserved === true && evidence.claudePolicyObserved === true);
  gate('bypass_denials', evidence.shellBypassDenied === true && evidence.pluginBypassDenied === true && evidence.configOverrideDenied === true && evidence.injectedToolBypassDenied === true);
  gate('galileo_separate', evidence.galileoBoundaryVerified === true);
  gate('principal_binding', evidence.principalBindingVerified === true);
  const a = evidence.accounts?.[0], b = evidence.accounts?.[1];
  gate('two_independent_accounts', !!a?.subject && !!b?.subject && a.subject !== b.subject && !!a.namespace && !!b.namespace && a.namespace !== b.namespace);
  gate('live_cross_account_denials', evidence.crossAccountReadDenied === true && evidence.crossAccountWriteDenied === true && evidence.freshSessionResume === true);
  gate('evidence_current', Number.isFinite(evidence.checkedAt) && evidence.checkedAt <= now && now - evidence.checkedAt < 24 * 60 * 60 * 1000);
  return { readyForAcceptance: gates.every(x => x.passed), systemSealed: false, gates, missing: gates.filter(x => !x.passed).map(x => x.name), note: 'This audit does not attest evidence authenticity or replace observed host and service tests.' };
}
