# Shared Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This is the Dashboard side of the cross-repository Native plan; checkbox steps are tracked in the authoritative Core plan.

**Goal:** Extract a portable, read-only Dashboard display package and preserve the existing Obsidian Task/Case experience while enabling Codex reuse.

**Architecture:** packages/dashboard-ui owns content/presentation and standard-DOM reading components. Obsidian injects its existing Markdown and navigation functions; Codex consumes a pinned module artifact. No producer or Task writer is moved into the UI.

**Tech Stack:** Existing TypeScript/esbuild/markdown-it 15.0.2, browser DOM, current isolated Node test runner.

**Spec:** Vault Notes/Plans/2026-10-12-FlowDesk-Dashboard-Codex会话版设计.md.

## Global Constraints

- Overview-first in Codex, exact-reference view/copy only there.
- Keep Obsidian's current navigation, theme, complete body/source semantics and document center.
- No Task/Case business writes or global HTMLElement prototype patch.
- Browser exports have no Node, Obsidian, private Core, credentials or CDN dependency.
- Package version follows Dashboard's version; source candidate assets do not imply a published release.
- Do not commit, push, bump product versions, install or release without separate authorization.

## Review Focus

1. Empty structured requirements do not erase full API original content.
2. Repeated headings and multiple execution/verification/delivery rounds retain source order.
3. Stale/unknown Progress never promotes historical Next.
4. Wiki/Markdown occurrence handling and literal hash file paths retain original navigation behavior.
5. Case task coverage gaps never appear as empty/complete data.

## Authoritative sequence

Core worktree: /private/tmp/flowdesk-association-panel-01a11fbf.
Plan: docs/superpowers/plans/2026-10-12-dashboard-codex-session.md.
Dashboard branch base: 9ac1359; execution method: Native, followed by one fresh whole-change review.

### Local Task 1: Shared model/presentation package

**Files:** packages/dashboard-ui/{package.json,tsconfig.json,src/model.ts,src/index.ts}; move the pure snapshot/Case/content/currentness/presentation closure; preserve src compatibility re-exports; tests/shared-dashboard-model.test.ts.

**Interfaces:** Existing model/presentation export names and signatures remain stable; Node-safe model subpath and browser-safe public exports.

- [x] Write and observe RED for canonical-fixture package parity and no input mutation.
- [x] Extract the model closure; extend isolation readable roots to exact package source.
- [x] Pass current model/content/Case/legacy-v3 tests plus typecheck/build.

### Local Task 2: Portable reading components and Obsidian adapter

**Files:** packages/dashboard-ui/src/{dom,task-overview,task-content-renderer,work-case-renderer,progress-history,progress-disclosure,case-reference-list}.ts and pure helper closure; package reading styles; src/main.ts; tests/support/dom.ts.

**Interfaces:** Shared renderers inject Markdown and source/reference callbacks through DashboardUiHost; no assumed Obsidian DOM extension.

- [x] Observe RED with standard-DOM fixtures and source-order/read-only assertions.
- [x] Port components and common styles; connect existing Obsidian host functions without changing native navigation.
- [x] Pass renderer, exact-source navigation, references and complete-body checks.

### Local Task 3: Safe Markdown and reproducible local artifact

**Files:** packages/dashboard-ui/src/{markdown,browser}.ts; scripts/build-dashboard-ui.mjs; scripts/package-dashboard-ui.mjs; package/release recipes and checks.

**Interfaces:** renderReadonlyMarkdown(text: string): string; browser entry plus model export; artifact protocol association-dashboard/1 and SHA-256 metadata.

- [x] Observe RED for rich Markdown, task-list/callout/wiki display, unsafe content and artifact checks.
- [x] Implement the adapter and artifact; retain image placeholders and accurate reference display.
- [x] Verify the existing four Obsidian release files plus the new local UI tarball/hash recipe. No network publishing.

### Local Task 4: Full regression and handoff

- [x] Run full isolated npm test against the owned Core worktree.
- [x] Run build, typecheck, syntax and release-package checks.
- [x] Deliver the exact candidate artifact to Core and compare both consumers' canonical-fixture displays.
- [x] Record source results separately from real Obsidian/Codex installation acceptance; leave all Git/publication actions for explicit authorization.

## Preparation verification

2026-10-12: full existing isolated baseline passed 376 tests with zero failed/cancelled/skipped. Source modules and installed Obsidian files are unchanged. Execution-plan review is pending in the parent chat; Native implementation is preserved.

## Source completion, 2026-10-12

Approved plan implemented inline and independently reviewed; all findings fixed in one observed RED→GREEN pass. Full isolated suite 385/385 passed, plus root/shared typecheck, build, syntax, release verify and local packaging. Obsidian compatibility entries and original style bytes preserved; portable fullSections option adds complete background/original-history reading for Codex without changing the default Obsidian excerpts. Core actual MCP1556/1556 and Python-fast1566/1566 passed; actual built Chrome source fixture17/17 passed across widths/light/dark and real scroll/reference interaction.

Candidate archive SHA256 0e0fd216b392096191729bfddfff3edb8cc232b134679fcae85f73b7bc1329c5, version2.0.14 source-candidate, displayProtocol association-dashboard/1. Core stores this archive plus generated per-asset lock hashes. No product version bump, push, release or installed-host mutation. User authorized the necessary reviewed commit and local main integration on 2026-10-13. Installed Obsidian/Codex and actual clipboard permissions remain for normal-release acceptance. Working tree and exact cross-repo execution ledger remain retained in the authoritative Core worktree.

## Local integration authorization, 2026-10-13

Parent user requested “合并吧”: commit the reviewed shared-UI change and fast-forward local main, together with Core integration. No push, publication, product-version change or host installation. Fresh checks and exact main-tree comparison govern this delivery.
