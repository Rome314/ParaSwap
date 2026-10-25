# Shared contracts package

Follow the root `AGENTS.md`. `src/addresses.ts` owns the shared address map;
its values are configuration and require chain verification before live use.
Most `src/abis/*.json` files are exported from Hardhat artifacts. The existing
WA7A5 ABI and `erc20.min.json` are maintained separately; preserve that distinction.
Update exports in `src/abis/index.ts` deliberately when adding a supported API.
Run root `npm run build:contracts` to compile, export, sync the Go snapshots, and
build this package. Never edit `dist/` or a generated ABI to hide a source mismatch.
