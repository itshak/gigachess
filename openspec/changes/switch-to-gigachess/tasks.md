## 1. Package Configuration & Identity

- [x] 1.1 Update `package.json` package name to `gigachess`, update repository URLs, homepage, bugs URLs, and verify package loads cleanly
- [x] 1.2 Update module exports and typescript declaration paths in `package.json` and verify `npm run build` generates valid typings in `dist/`
- [x] 1.3 Prepare backward-compatibility re-export package or deprecation script for `turbochess` to ensure seamless transition for early adopters

## 2. Brand Identity & Visual Assets

- [x] 2.1 Deploy generated high-resolution GigaChess cybernetic logo to `assets/logo.png` and verify visual rendering in markdown viewers
- [x] 2.2 Create updated social preview card `assets/social-preview.png` with GigaChess branding, metrics, and feature highlights
- [x] 2.3 Update documentation asset links, badges, and OpenGraph tags in `README.md`

## 3. Documentation & Codebase References

- [x] 3.1 Update `README.md` title, introduction, installation snippets (`npm install gigachess`), and code examples
- [x] 3.2 Update `AGENTS.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, and `CONTRIBUTING.md` to reflect the `gigachess` project identity
- [x] 3.3 Update benchmark labels and logs in `bench/bench-real.mjs` and related scripts to display `GigaChess`
- [x] 3.4 Review and update test files and assertions for package name references

## 4. Verification & NPM Publishing Preparation

- [x] 4.1 Run full TypeScript typecheck (`npm run typecheck`) and verify zero errors
- [x] 4.2 Run complete unit and parity test suite (`npm test`) and verify 165+ tests pass
- [x] 4.3 Run workstation benchmark suite (`node --expose-gc bench/bench-real.mjs --quick`) and verify all 24 performance gates remain green
- [x] 4.4 Perform a dry-run npm pack (`npm pack --dry-run`) to verify package contents, files list, and bundle size
