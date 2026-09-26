# Vendored: eslint-plugin-react (7.37.5 + eslint-10 compat patch)

Source: npm registry tarball `eslint-plugin-react@7.37.5` (the latest published release).
Reason: eslint 10 removed `context.getFilename()`. Published 7.37.5 calls it directly in
`lib/util/version.js` (`resolveBasedir`), which crashes every react rule on eslint 10.
Upstream master already carries an equivalent fix (delegates to the `lib/util/eslint.js`
shim), but has not been released since 2025-04-03.

Changes vs upstream 7.37.5 (exactly three):
1. `lib/util/version.js` — inline eslint-10-safe fallback:
   `typeof context.getFilename === 'function' ? context.getFilename() : context.filename`
2. `package.json` — peer range widened to include eslint `^10`.
3. `package.json` — `devDependencies` removed. Upstream's test/tooling deps (mocha 5.2.0,
   istanbul, ls-engines, markdownlint-cli, npmignore, typescript-eslint-parser, @babel/*,
   eslint 8) were never needed to run the plugin, but because this package is consumed via
   `file:`, npm installed them into the root tree. They dragged in tar, minimist, mkdirp,
   pacote, @npmcli/arborist, sigstore, semver 5, ajv 6 and accounted for 37 of the 39
   `npm audit` findings. `dependencies` is untouched, so rule behaviour is unchanged.
   Do not restore this block by re-vendoring the upstream tarball verbatim.

Removal condition: switch back to a normal registry dependency once eslint-plugin-react
ships eslint-10 support (peer range including `^10` and util-based `getFilename`).
Note: as vendored, `peerDependencies` still reads `^9.7` without `^10`, contradicting
change 2 above — eslint 10 is installed and lint passes, so npm is tolerating it, but
the file and this README disagree.
