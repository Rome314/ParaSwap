# Backend

Follow the root `AGENTS.md`. This is currently a small HTTP stub with health,
ABI-listing, and address endpoints. Keep it compact until real use cases exist.
When adding business behavior, group it under `internal/<feature>/`, keep HTTP
decoding separate from business decisions, and define narrow dependency interfaces
where consumed. Do not add empty architecture layers. Contract snapshots come from
`blockchain/scripts/export-artifacts.ts`; edit their owning sources. Run
`go test ./...` and `go vet ./...` from this directory; no current Go tests means
these checks verify compilation/static analysis only.
