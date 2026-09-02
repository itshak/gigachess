# turbochess (Renamed to gigachess)

> **Important Notice:** The `turbochess` package has been renamed to **[`gigachess`](https://www.npmjs.com/package/gigachess)**.

Please update your `package.json` dependencies:

```bash
npm uninstall turbochess
npm install gigachess
```

And update your import statements:

```ts
// Before:
// import { Chess } from 'turbochess';

// After:
import { Chess } from 'gigachess';
```

All existing APIs, performance advantages, and drop-in compatibility remain 100% intact under `gigachess`.
