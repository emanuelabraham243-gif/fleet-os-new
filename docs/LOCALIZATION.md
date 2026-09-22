# FleetOS — Localization

Amharic (`am`) is the default and primary language; English (`en`) is
supported. This is not a later phase — every user-facing string in the app
ships in both languages from day one, enforced by an automated test.

## How it works

- `src/locales/en.ts` and `src/locales/am.ts` hold the core dictionary
  (nav, auth, account, enum labels, errors, void, empty/error states).
- `src/locales/features/{home,trips,maintenance,drivers}.ts` hold
  per-feature strings; `src/locales/index.ts` merges all of them into one
  dictionary per locale.
- **English is the source of truth.** New keys are added to `en` first;
  `am` is typed (`Widen<typeof en>`) so TypeScript itself requires every
  English key to have an Amharic counterpart.
- `src/lib/i18n-core.ts` — pure `translate()`/`enumLabel()` lookup with
  `{placeholder}` interpolation, safe to use in client components. Server
  components use `getI18n()` (`src/lib/i18n.ts`), which additionally reads
  the user's stored language preference (`profiles.language`) and a
  `fleetos_lang` cookie fallback.
- Enum values (statuses, categories, roles) stay in English in the
  database and code (`AVAILABLE`, `DIESEL`, `admin`, ...); only their
  display label is translated, via `enums.<group>.<code>` and the
  `label()` helper / `<StatusBadge>` component.

## Automated enforcement (`src/lib/i18n.test.ts`)

Every `npm test` run checks:

1. `en` and `am` have **identical key sets** — a key added to one without
   the other fails the build.
2. No dictionary value is an empty string.
3. Every Amharic enum label actually differs from its English counterpart
   (catches accidentally copy-pasted English left untranslated).
4. Amharic and English versions of the same key use the same
   `{placeholder}` variables.
5. Every literal `t('...')` / `label('group', 'code')` call found anywhere
   in `src/` resolves to a real dictionary key — a typo'd or removed key
   fails the test, not just a silent fallback at runtime.

This means a translation gap is a build failure, not something that ships
and gets noticed later by an Amharic-speaking user.

## Font and rendering

Amharic renders left-to-right using the Unicode Ethiopic block; the app
uses a font stack that supports it and does not assume Latin-only text
widths, which matters for the phone-first layout (see `docs/WORKFLOWS.md`
for the UI conventions this feeds into).
