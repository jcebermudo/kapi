<p align="center">
  <img
    width="300"
    height="auto"
    alt="Kapi UI logo"
    src="https://github.com/user-attachments/assets/4a1e40af-e318-489f-afbd-f861a0375614"
  />
</p>

<p align="center">
  <strong>Point your coding agent at the exact component in your Vue or Nuxt app.</strong>
</p>

<p align="center">
  Click any rendered element, describe what you want changed, and send its source context directly to Claude Code or Codex.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/kapi-ui"><img alt="npm version" src="https://img.shields.io/npm/v/kapi-ui" /></a>
  <a href="https://github.com/jcebermudo/kapi-ui/blob/main/LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/jcebermudo/kapi-ui" /></a>
</p>

<p align="center">
  <img width="642" height="480" alt="kapi-github-demo" src="https://github.com/user-attachments/assets/d5aecaed-568d-4f76-9ec3-2d2369ede45e" />
</p>

## Quick start

Run Kapi from the root of your Vue or Nuxt project:

```bash
npx kapi-ui
```
Kapi detects your framework, adds the required integration, and starts your configured coding agent.

Then run your dev server as usual and use the overlay to select and element and submit an instruction.

## Supported integrations

### Frameworks

- Vue with Vite
- Nuxt

### Coding agents

- Claude Code
- Codex CLI
- Any coding agent through manual copy-and-paste mode

## Manual installation

Install Kapi as a dev dependency:

```bash
npm install kapi -D
```

### Vite and Vue

Add the Kapi plugin to `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import kapi from 'kapi-ui/vite-plugin'

export default defineConfig({
  plugins: [
    vue(),
    kapi({
      agent: 'claude',
    }),
  ],
})
```

### Nuxt

Add the Kapi plugin to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['kapi-ui/nuxt'],

  kapi: {
    agent: 'claude',
  },
})
```

## Configuration

The required `agent` option accepts:
```ts
'claude' | 'codex' | false
```

Use `false` to enable manual copy-and-paste mode without starting an agent session.

## License

[MIT](https://github.com/jcebermudo/kapi-ui/blob/main/LICENSE)
