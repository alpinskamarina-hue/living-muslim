
## Languages (RU / EN)

The whole app speaks Russian and English. Every Russian UI string goes through `_t('Текст')` (or `_tj(...)` for JSX text with values inside) from `src/i18n.ts`; the English is in `src/en.ts`, keyed by the Russian text, with `{0}`, `{1}` for values. The language is read once at start (Profile → Язык · Language, or the phone's language) and switching reloads the app.

When adding UI text: write it as `_t("Русский текст")` and add the English line to `src/en.ts`. A string missing from `en.ts` simply shows in Russian. `node scripts/i18n-codemod.cjs apply` wraps any new bare Russian strings automatically; `extract` lists all keys in `scripts/i18n-keys.json`.
