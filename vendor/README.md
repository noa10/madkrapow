# Vendored: eslint-plugin-react (7.37.5 + eslint-10 compat patch)

Source: npm registry tarball `eslint-plugin-react@7.37.5` (the latest published release).
Reason: eslint 10 removed `context.getFilename()`. Published 7.37.5 calls it directly in
`lib/util/version.js` (`resolveBasedir`), which crashes every react rule on eslint 10.
Upstream master already carries an equivalent fix (delegates to the `lib/util/eslint.js`
shim), but has not been released since 2025-04-03.

Changes vs upstream 7.37.5 (exactly two):
1. `lib/util/version.js` — inline eslint-10-safe fallback:
   `typeof context.getFilename === 'function' ? context.getFilename() : context.filename`
2. `package.json` — peer range widened to include eslint `^10`.

Removal condition: switch back to a normal registry dependency once eslint-plugin-react
ships eslint-10 support (peer range including `^10` and util-based `getFilename`).
