# Contributing to Jupitrr Cut

Thanks for looking at the code. This project is GPL-3.0 — fork it, ship it, keep it open.

## Your first contribution: a teleprompter font

The easiest way to get familiar with the codebase is to add a new teleprompter font, not to
rewrite the editing engine. Fonts follow a repeated pattern across a handful of files: add the
`@expo-google-fonts/*` package, extend the `TeleprompterFont` union in
`lib/repositories/types.ts`, load it in `app/_layout.tsx`, and add it to the `FONT_OPTIONS` list
in both `app/(main)/settings.tsx` and `app/(main)/projects/[id]/record.tsx`. Follow the pattern of
an existing font and open a PR with a screenshot of it selected in the teleprompter.

Small, reviewable PRs like this get merged fastest. Larger changes (new screens, engine changes,
architecture shifts) should start as an issue first so we can agree on the approach before you
put in the work.

## Setup

```bash
bun install
bun run start
```

`bun run check-all` runs format:check + typecheck + lint — run it before opening a PR.

## Ground rules

- Editor must keep working fully logged out. Do not add an account wall.
- Do not reintroduce backend code (medias-lambda, users-lambda, or any server-side service).
- Do not relicense or remove the LICENSE header.
- See [AGENTS.md](AGENTS.md) for the constraints an AI coding agent should follow in this repo —
  the same constraints apply to human contributors.

## Reporting bugs

Use the bug report issue template. For build failures specifically, use the build-failure
template — it asks for the exact command and platform, which is the fastest way to get a fix.

## Security issues

Do not open a public issue for a security vulnerability — see [SECURITY.md](SECURITY.md) if
present, or email the maintainers directly.
