# Brand theme lab implementation plan

**Goal** — Compare four independent implementations of one brand-aware operations dashboard.

**Architecture** — Vite builds a launcher and four HTML documents. The variants share the dashboard's data, behavior, theme contract, and regression scenarios. Each document selects its own styling and component implementation.

**Tech stack** — React, TypeScript, Vite, CSS Modules, styled-components, Tailwind CSS, shadcn/ui, Playwright.

## Tasks

- [x] Run the browser contract against the empty entries. Prove the missing dashboard fails the test.
- [x] Add the fixture, theme resolver, account session, dashboard, and modal. Pass the CSS Modules contract.
- [x] Adapt styled-components, Tailwind CSS, and shadcn/ui. Pass the same contract in all four documents.
- [x] Build all documents, measure the production bundles and switch timing, and record the implementation trade-offs.

## Review focus

Cover missing and invalid env values, account precedence, reload and sign-out, portal colors and keyboard focus, mobile overflow, and isolation between the launcher and the dashboard documents.
