# Contributing to TurboChess

Thank you for your interest in contributing to **TurboChess** — the fastest JavaScript and TypeScript chess engine and workstation library.

---

## 🛠️ Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/itshak/turbochess.git
cd turbochess

# 2. Install dependencies
npm install

# 3. Build & Typecheck
npm run build
npm run typecheck

# 4. Run tests
npm test

# 5. Run real workstation benchmarks
npm run bench:real -- --quick
```

---

## 📐 Core Engineering Principles

1. **Performance Primacy:** Any changes touching move generation, attacks, or board state must preserve or improve throughput. Run `npm run bench:real` before submitting PRs.
2. **Zero-BigInt Bitboards:** Store bitboards as `{ lo: number, hi: number }` (low/high 32-bit unsigned integers with `>>> 0`). Avoid `BigInt` allocations in hot loops.
3. **Exact Parity:** 100% exact parity with `chess.js` for game rules/SAN and `chessops` for movegen is strictly enforced. All 165+ tests must pass.
4. **MIT License Integrity:** TurboChess is clean-room and 100% MIT. Do NOT copy code from GPL-only or restrictive repositories.

---

## 🚀 Submitting a Pull Request

1. Fork the repo and create a feature branch (`git checkout -b feature/awesome-speedup`).
2. Implement your changes with clean, well-tested TypeScript code.
3. Ensure all tests and type checks pass (`npm run typecheck && npm test`).
4. Commit with a clear, descriptive message.
5. Open a Pull Request on GitHub.

Thank you for making chess software faster for everyone!
