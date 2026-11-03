// A deterministic disclosure guard, not a semantic confidentiality classifier.
export function inspectPublicContent(name, text) {
  const issues = [];
  const parts = name.split('/');
  if (parts.some(p => /^(?:\.env(?:\..*)?|\.realm|\.mnx-agi|\.private(?:-.*)?|private|backups|outputs|receipts|transcripts)$/i.test(p)) || /\.(?:pem|key|p12|pfx|sqlite|db|zip|tgz|tar)$/i.test(name)) issues.push('private_artifact_path');
  if (/\/(?:Users|home)\/[^/\s]+\//.test(text)) issues.push('machine_path');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|\bAKIA[A-Z0-9]{16}\b/.test(text)) issues.push('credential_pattern');
  if (/\borg:[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(text)) issues.push('real_namespace');
  for (const match of text.matchAll(/[A-Z0-9.!#$%&'*+/?^_`{|}~-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
    if (!/^(?:example\.(?:com|org|net|invalid)|[^.]+\.example\.(?:com|org|net|invalid))$/i.test(match[1])) issues.push('non_example_email');
  }
  return [...new Set(issues)];
}
