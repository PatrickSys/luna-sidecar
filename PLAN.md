# Luna Sidecar implementation plan

This file is the entry point. V1 is implemented and independently verified. The final-shape product amendment is locked, but its runtime changes are not implemented yet.

The executable planning contract lives in:

- [`.planning/SPEC.md`](.planning/SPEC.md) — product, protocol, safety, and acceptance requirements.
- [`.planning/ROADMAP.md`](.planning/ROADMAP.md) — the four verified v1 phases plus the bounded final-shape follow-up.
- [`.planning/research/00-HARNESS-ENGINEERING.md`](.planning/research/00-HARNESS-ENGINEERING.md) — source-backed harness decisions and rejected complexity.
- [`.planning/phases/01-contract-and-harness/01-PLAN.md`](.planning/phases/01-contract-and-harness/01-PLAN.md)
- [`.planning/phases/02-lifecycle-and-authority/02-PLAN.md`](.planning/phases/02-lifecycle-and-authority/02-PLAN.md)
- [`.planning/phases/03-observation-and-safety/03-PLAN.md`](.planning/phases/03-observation-and-safety/03-PLAN.md)
- [`.planning/phases/04-agent-ux-and-delivery/04-PLAN.md`](.planning/phases/04-agent-ux-and-delivery/04-PLAN.md)
- [`.planning/phases/05-simple-subagent-ux/05-PLAN.md`](.planning/phases/05-simple-subagent-ux/05-PLAN.md) — the only open implementation phase.
- [`.planning/V1-VERIFICATION.md`](.planning/V1-VERIFICATION.md) — preserved verification of the narrower v1 contract.

The redacted cross-machine evidence remains alongside the plan:

- [`docs/audits/2026-08-08-work-laptop-evidence-handoff.md`](docs/audits/2026-08-08-work-laptop-evidence-handoff.md)
- [`docs/audits/2026-08-08-work-laptop-evidence-response.md`](docs/audits/2026-08-08-work-laptop-evidence-response.md)

The former monolithic plan is superseded. Its useful decisions and evidence have been reconciled into the files above; Git history retains the original. Historical audits and v1 verification remain evidence, not editable claims about Phase 5.

Status: Phase 5 planning complete after approval and document verification. This packet changes no launcher or test code. Implement Phase 5 later from `05-PLAN.md`, then independently verify it before changing the public final-shape claim from planned to shipped.
