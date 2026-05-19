# Philosophy

praxis-ai's behaviour is governed by eight operating principles. They
are not aspirational — they constrain the rest of the overlay.

## P1 — Plan and execution are separate artefacts

The plan is a written object that survives the conversation. Code is
the output of an approved plan, not a substitute for it. Apply planning
effort proportionally to scope: skip planning for one-sentence diffs,
invest in a structured plan (via SDD or grilling) for multi-component
work.

## P2 — Minimal footprint, prefer reversibility

Do the least that achieves the goal. Prefer reversible actions. When
an action is irreversible, gate it behind explicit user confirmation.
The firewall is the implementation of this principle at the tool layer.

## P3 — Verification loops close the work

A task is not done until something verifies its output. Tests, lint,
screenshots, type-checking, or a critic LLM are all acceptable
signals. Without a verification signal, do not declare success. praxis
encourages writing the verification before the implementation when a
correct seam exists (the diagnose skill formalises this).

## P4 — Context is a binding resource

The context window is RAM. Treat it as a budget. Prune phases when
they are no longer relevant. Surface usage when it approaches
saturation. The balanced preset warns at 75 % of effective capacity;
`praxis context-usage` records and surfaces samples.

## P5 — Tools are first-class engineering

Tool descriptions and parameter shapes affect outcomes as much as
model choice. Prefer narrow, well-described tools. Poka-yoke parameter
design prevents mistakes before they happen. praxis-ai picks tools
deliberately and exposes them through the canonical Claude Code
permission model rather than ad-hoc wrappers.

## P6 — Irreversibility triggers mandatory confirmation

Reversible actions proceed under monitoring. Irreversible actions
pause and request explicit human authorisation. This is universal
across Anthropic, OpenAI Model Spec, and Google Cloud architecture
guidance. The two-layer firewall (deny list + AST hook) is the
operational realisation.

## P7 — Incremental autonomy, not big-bang

Trust grows from demonstrated success. Start gated, graduate to
autonomous within proven boundaries. The phase model (F0 → F1 → F2 →
F3) is incremental autonomy made concrete: high interaction at task
startup, high autonomy in execution, human gate at review.

## P8 — Ambiguity before execution is cheaper than correction after

Pre-execution clarification is the cheapest place to resolve
uncertainty. Surface ambiguities to the user before code is written,
not after. The grill-with-docs skill is the operational tool for this.

## How the principles compose

The principles map onto the phase flow:

- **F0 Inquiry** is P1, P8: planning and pre-execution clarification.
- **F1 Plan** is P1, P3: structured plan + verification scaffold.
- **F2 Execute** is P2, P5: minimal footprint with well-chosen tools.
- **F3 Review** is P3, P6, P7: verification + human gate.

Backward transitions exist because P3 fails in real life: tests
break, specs reveal new ambiguity, scope inflates. When that happens
praxis exits execution back to the appropriate planning phase rather
than silently drifting.
