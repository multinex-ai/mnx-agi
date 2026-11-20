# mnx-sync

One source of truth for the rules you give every coding agent. It renders `AGENTS.md`, `CLAUDE.md` and `GEMINI.md` from
one template and a set of named blocks, and keeps them from drifting. No dependencies, no network.

## How it works

```
rules/
  template.md            order of blocks:  {{block:CORE}}
  constitution/CORE.md   each .md file is one block, named by its file name
  accords/STANDARDS.md
  profile/OWNER.md
  manifest.txt           target <name> <path> [skip=BLOCK,BLOCK]
```

- A block name is the file name without `.md`, unique across all tiers.
- Every target renders the same template unless it lists `skip=` blocks. The gemini target in the example skips `OWNER`.
- A block that exists but is never placed in the template is an error, and so is a placeholder with no block.
- `export <BLOCK> <path>` keeps a derived copy of a block in lockstep with its source.
- Paths starting with `~/` expand from `$HOME`. Other paths are relative to the directory you run the command from.

Tiers are just folders. The example uses `constitution`, `accords` and `profile` so a shared set of rules can live apart
from personal ones; keep personal and private blocks in a private checkout.

## Commands

```bash
cargo build --release
export MNX_ROOT=$PWD/example          # root of the rules tree (default: current directory)
cd example

../target/release/mnx-sync check      # exit 0 if targets match, 1 on missing or drift, 2 on error
../target/release/mnx-sync render     # stage files in out/, change nothing live
../target/release/mnx-sync apply --yes
../target/release/mnx-sync split <file> <dir>   # turn an existing rules file into template + blocks
```

`skills check` and `skills apply --yes` link shared skill folders into each agent's skills directory, driven by a
`skills.manifest`. `install --yes` runs both.

## Safety

- Nothing live is written without `--yes`.
- `apply` keeps a copy of every file it replaces under `backups/`, writes through a temporary file, reads the result
  back, and restores the backup if it differs.
- `apply` writes a JSON receipt under `receipts/` with before and after hashes.
- A second `apply` changes nothing.

## Limits

`mnx-sync` copies text. It does not make an agent follow the rules and it does not enforce them; for enforcement see
[the boundary design](../../docs/AGENT_BOUNDARY.md). Running it from a copy of the example directory is the safest way
to try it, because `apply` writes to the paths in `manifest.txt`.

## Tests

```bash
cargo test
```

Unit tests cover parsing, rendering and hashing. Integration tests run the real binary against a copy of the example:
check before and after apply, idempotence, drift detection and repair with a backup and receipt, refusal without
`--yes`, orphan blocks, render staging and usage errors.
