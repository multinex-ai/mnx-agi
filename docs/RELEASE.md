# Release process

1. Review source, policy changes and public disclosure scope. Keep client names, real accounts/namespaces, credentials, local paths, transcripts, private audits and local backups outside the repository.
2. Update package/core version and compatibility notes. Synchronize skill references with `node tools/build-skills.mjs`.
3. Run `npm run manifest`, `npm test` and `npm run check`. Review the complete manifest change. Test install/verify/rollback in an isolated home.
4. Commit the reviewed tree, run CI, and tag the exact commit. Create the archive from that commit with `git archive`, not from a working directory containing private files.
5. Publish the archive and its SHA-256 checksum with release notes describing changes, validation and remaining integration boundaries. Do not imply signatures or attestation where only checksums exist.
6. Verify a fresh downloaded release before local adoption. Keep prior release bytes and installation backups until the upgrade has been verified.

The package is distributed through GitHub. `private: true` in package.json prevents accidental npm publication; it does not indicate repository visibility. Release publishing remains an explicitly authorized maintainer action.
