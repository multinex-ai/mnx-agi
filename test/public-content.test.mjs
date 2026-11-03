import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPublicContent } from '../tools/public-content.mjs';

test('public disclosure guard accepts portable documentation and reserved examples', () => {
  assert.deepEqual(inspectPublicContent('docs/example.md', 'Connect to https://mcp.multinex.ai/mcp/v1 with owner@example.invalid and org:example.'), []);
});
test('public disclosure guard rejects nested backups and private state', () => {
  for (const name of ['docs/private/notes.md', 'examples/.env.local', 'project/.realm/config.json', 'backups/install.json', 'dump.sqlite']) assert.ok(inspectPublicContent(name, '').includes('private_artifact_path'));
});
test('public disclosure guard rejects tenant identifiers and non-example accounts without echoing values', () => {
  const address = ['person', 'customer.invalid'].join('@');
  const namespace = 'org:' + ['12345678', '1234', '1234', '1234', '123456789abc'].join('-');
  assert.deepEqual(inspectPublicContent('docs/example.md', address), ['non_example_email']);
  assert.deepEqual(inspectPublicContent('docs/example.md', namespace), ['real_namespace']);
});
test('public disclosure guard rejects machine paths and credentials', () => {
  assert.ok(inspectPublicContent('example.md', '/' + 'Users/operator/private/').includes('machine_path'));
  assert.ok(inspectPublicContent('example.md', 'ghp_' + 'x'.repeat(36)).includes('credential_pattern'));
});
