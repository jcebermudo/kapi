<img width="300" height="auto" alt="kapi-logo" src="https://github.com/user-attachments/assets/4a1e40af-e318-489f-afbd-f861a0375614" />

Kapi UI is a visual commenting tool for your coding agents. Click an element, comment, and send to your agent. No copy-pasting file paths or describing an element.

It currently works with Vue projects (Vite + Vue or Nuxt) paired with Claude Code or Codex. Support for other frameworks and agents coming soon.

## Requirements

- A Vue project (Vite + Vue or Nuxt)
- Claude Code/Codex CLI

## How it works

At its core, Kapi UI is a Vite plugin. It injects the UI overlay into your dev app and uses the HMR websocket to send your comments to your agent. You can also opt to manually copy your comments and paste them into any coding agent of your choice.

## Automatic Installation

From your project root:
```bash
npx kapi-ui
```

Useful flags:
```bash
npx kapi-ui --vite              # force Vite + Vue setup (skip auto-detection)
npx kapi-ui --nuxt              # force Nuxt setup
npx kapi-ui --agent=claude      # force Claude Code
npx kapi-ui --agent=codex       # force Codex (experimental)
npx kapi-ui --manual            # copy/paste workflow, no agent
```

## Manual Installation

1. Install the package as a dev dependency:
```bash
npm install kapi-ui -D
```
2. Wire it into your config

**Vite + Vue** (`vite.config.ts`):
```ts
import kapi from 'kapi-ui/vite-plugin'

export default defineConfig({
  plugins: [kapi({ agent: 'claude' })],
})
```

**Nuxt** (`nuxt.config.ts`):
```ts
export default defineNuxtConfig({
  modules: ['kapi-ui/nuxt'],
  kapi: { agent: 'claude' },
  })
```

The `agent` option is required — use `'claude'`, `'codex'`, or `false` (copy/paste only, no agent spawned).

3. Run your dev server as usual. The UI overlay is injected and your agent session starts automatically.

## Configuration

The only option, on both the Vite plugin and the Nuxt module:

| Option  | Type                           | Default      | What it does                                                         |
| ------- | ------------------------------ | ------------ | -------------------------------------------------------------------- |
| `agent` | `'claude' \| 'codex' \| false` | — (required) | Which agent Kapi drives. `false` = copy/paste only, no agent spawned |

Kapi UI uses Vite's HMR websocket to start a Claude Code and Codex Sessions.

## License

[MIT](https://github.com/jcebermudo/kapi-ui/blob/main/LICENSE)
