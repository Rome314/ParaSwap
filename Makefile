.PHONY: help doctor harness-test check build test

help:
	@echo "doctor        Check local source/Git availability without reading secrets"
	@echo "harness-test  Run dependency-free project tooling regression tests"
	@echo "check         Run the complete local verification pipeline"
	@echo "build         Compile contracts, sync ABIs, and build the frontend"
	@echo "test          Run local contract tests (fork tests remain separate)"

doctor:
	@PYTHONDONTWRITEBYTECODE=1 python3 scripts/preflight.py

harness-test:
	@PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -v
	@node --test scripts/tests/*.test.mjs

check:
	npm run check

build:
	npm run build

test:
	npm run test:unit
