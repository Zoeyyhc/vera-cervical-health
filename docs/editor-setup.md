# Editor Setup

## VS Code

### Required extension

Install the official [Biome extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) (`biomejs.biome`).

### Disable Prettier

If you have the Prettier extension installed, disable it for this workspace — Biome is the sole formatter. In `.vscode/settings.json` (create if absent):

```json
{
  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[json]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  },
  "prettier.enable": false
}
```

### What Biome does on save

- Formats code (indentation, quotes, trailing commas)
- Organises imports alphabetically
- Applies safe lint auto-fixes

Run `pnpm lint` to check the whole project, or `pnpm format` to auto-fix.

## Other editors

Biome ships [LSP support](https://biomejs.dev/guides/editors/first-party-plugins/) for JetBrains IDEs and Neovim. See the Biome docs for setup instructions.
