# TR2 — NON-TRIVIAL classifier behaviour

## Covers
- P8 pre-execution clarification
- F0 sprint-mode classifier (NON-TRIVIAL path)
- `/grill-with-docs` proposed instead of immediate coding

## Prompt
See `TR2-nontrivial-classifier.prompt.txt`.

## Expected
The model identifies the request as NON-TRIVIAL (multi-component
scope, vague nouns, "implement" verb). It surfaces concrete ambiguities
and proposes `/grill-with-docs` with `y / n / proceed-with-assumptions`.
The model does NOT begin coding immediately.

## Assertion
`TR2-nontrivial-classifier-assert.sh` checks that the captured stdout:

- Contains "grill-with-docs" (case-insensitive)
- Contains "y", "n", and "proceed" or "assumptions" near each other
  (the three-option pattern from `phase-flow.md`)
- Exit code is 0
