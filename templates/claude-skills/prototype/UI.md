# UI branch — Mechanism

Generate several radically different UI variations on a single route,
switchable from a floating bottom bar. The user flips between variants,
picks one (or steals parts from each), and discards the rest.

If the question is about logic or state rather than appearance, switch
to [LOGIC.md](LOGIC.md).

## When this is the right branch

- "What should this page look like?"
- "I want to see a few options for this dashboard before committing."
- "Try a different layout for the settings screen."
- Any time the user would otherwise spend a day picking between vague
  mental mockups.

## Two sub-shapes — strongly prefer A

A UI prototype is much easier to judge when it butts up against the rest
of the app (real header, real sidebar, real data, real density). A
throwaway route in isolation is a vacuum — every variant looks fine.

### Sub-shape A — adjustment to an existing page (preferred)

The route already exists. Variants render on the same route, gated by a
`?variant=` URL search parameter. Existing data fetching, params, and
auth stay; only rendering swaps.

If the prototype is for something that does not yet have a page but
would naturally live inside one (a new dashboard section, a new card on
the settings screen, a new step in an existing flow), this is still
sub-shape A. Mount the variants inside the host page.

### Sub-shape B — a new page (last resort)

Use only when the thing being prototyped has no existing page to live
inside (an entirely new top-level surface, or a flow that cannot be
embedded). Create a throwaway route following the project's existing
routing convention. Do not invent a top-level structure. Name the route
so it is obviously a prototype (include the word `prototype`). Same
`?variant=` pattern.

Sanity-check before committing to sub-shape B: is there really no
existing page that could host this? An empty route hides design problems
a populated one would expose.

The floating bottom bar is identical in both sub-shapes.

## Procedure

### 1. State the question and pick N

Default to 3 variants. More than 5 stops being radically different and
starts being noise — cap there.

Write the plan in one line in the prototype's location or a top-of-file
comment:

> "Three variants of the settings page, switchable via `?variant=`, on
> the existing `/settings` route."

### 2. Generate radically different variants

Draft each variant. Hold each to:

- The page's purpose and the data it has access to.
- The project's component library or styling system (Tailwind, shadcn,
  MUI, plain CSS).
- A clear exported component name (`VariantA`, `VariantB`, `VariantC`).

Variants must be structurally different — different layout, different
information hierarchy, different primary affordance. Not just different
colours. If two drafts come out too similar, redo one with explicit
"do not use a card grid" guidance.

### 3. Wire them together

Single switcher component on the route:

```tsx
// pseudo-code — adapt to the framework
const variant = searchParams.get('variant') ?? 'A';
return (
  <>
    {variant === 'A' && <VariantA {...data} />}
    {variant === 'B' && <VariantB {...data} />}
    {variant === 'C' && <VariantC {...data} />}
    <PrototypeSwitcher variants={['A','B','C']} current={variant} />
  </>
);
```

For sub-shape A (existing page): all data fetching stays above the
switcher; only the rendered subtree changes per variant.

For sub-shape B (new page): the throwaway route under
`/prototype/<name>` mounts the same switcher.

### 4. Build the floating switcher

Fixed-position bar at the bottom-centre of the screen with three pieces:

- **Left arrow** — cycles to the previous variant, wraps around.
- **Variant label** — current variant key plus its name if exported,
  e.g. `B — Sidebar layout`.
- **Right arrow** — cycles forward, wraps around.

Behaviour:

- Clicking an arrow updates the URL search parameter via the framework
  router (`router.replace` on Next, `navigate` on React Router). The
  variant is then shareable and reload-stable.
- Keyboard: `←` and `→` keys also cycle. Do not intercept arrow keys
  when an `<input>`, `<textarea>`, or `[contenteditable]` is focused.
- Visually distinct from the page (high-contrast pill, subtle shadow)
  so it is obviously not part of the design being evaluated.
- Hidden in production builds. Gate on `process.env.NODE_ENV !==
  'production'` or the equivalent check, so a stray prototype merge
  cannot ship the bar to users.

Put the switcher in a single shared component so both sub-shapes reuse
it.

### 5. Hand over

Surface the URL and the `?variant=` keys. The user will flip through.
The interesting feedback is usually "I want the header from B with the
sidebar from C" — that is the actual design.

### 6. Capture the answer and clean up

Once a variant has won, record which one and why (commit message, ADR,
issue, or `NOTES.md` next to the prototype). Then:

- **Sub-shape A** — delete the losing variants and the switcher; fold
  the winner into the existing page.
- **Sub-shape B** — promote the winning variant to a real route; delete
  the throwaway route and the switcher.

Do not leave variant components or the switcher lying around. They rot
fast and confuse the next reader.

## Anti-patterns

- Variants that differ only in colour or copy. That is a tweak, not a
  prototype. Real variants disagree about structure.
- Sharing too much code between variants. A shared `<Header>` is fine; a
  shared `<Layout>` defeats the point.
- Wiring variants to real mutations. Read-only prototypes are fine. If a
  variant needs to mutate, point it at a stub.
- Promoting the prototype directly to production. The variant code was
  written under prototype constraints (no tests, minimal error
  handling). Rewrite it properly when folding it in.
