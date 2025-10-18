set shell := ["bash", "-uc"]

default:
    @just list

fmt:
    cargo fmt --all

lint:
    cargo clippy --all-targets --all-features -- -D warnings

test:
    cargo test --all --all-targets

check:
    cargo check --all

ci:
    just fmt
    just lint
    just test
