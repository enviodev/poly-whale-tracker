# Polymarket Whale Tracker

[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-7289da?logo=discord&logoColor=white)](https://discord.com/invite/envio)

A terminal UI (TUI) that shows large BUY trades on Polymarket in real-time, powered by [Envio HyperSync](https://docs.envio.dev/docs/HyperSync/overview).

![poly-whale-tracker TUI](https://raw.githubusercontent.com/enviodev/poly-whale-tracker/refs/heads/main/assets/tui.png)

## What This Does

- Streams Polymarket `OrderFilled` events from HyperSync in real-time
- Displays only BUY trades above a configurable USD threshold
- Optionally filters by buyer/wallet addresses
- Interactive terminal UI with trade detail view

## What is HyperSync?

[HyperSync](https://docs.envio.dev/docs/HyperSync/overview) is Envio's high-performance blockchain data retrieval layer. It is a purpose-built alternative to JSON-RPC endpoints, providing up to 2000x faster access to on-chain data across 70+ EVM networks.

## Prerequisites

- [Bun](https://bun.sh)
- An Envio API token ([get one here](https://docs.envio.dev/docs/HyperSync/api-tokens))

## Install

```bash
cd TUI
bun install
```

## Run

```bash
# First run - prompts for API key and saves to ~/.hypersync/.env
bun index.ts

# With a custom threshold (only show trades above $500)
bun index.ts -t 500

# With threshold and address filter
bun index.ts -t 500 -a "0xabc...,0xdef..."

# Pre-set API key via environment variable
ENVIO_API_TOKEN=your_key_here bun index.ts
```

## CLI Flags

| Flag | Description | Default |
|---|---|---|
| `-t <number>` | USD threshold for BUY trades | `100` |
| `-a <addr1,addr2,...>` | Comma-separated addresses to filter by | All addresses |

## Keyboard Controls

| Key | Action |
|---|---|
| `Up` / `Down` (or `k` / `j`) | Move selection |
| `Enter` | Open trade details |
| `T` | Set threshold |
| `A` | Set address filter |
| `Esc` / `Backspace` | Return from details |
| `C` | Clear trade list |
| `Q` / `Ctrl+C` | Quit |

## Related

- [Track Polymarket Trades](https://github.com/enviodev/track-poly-trades) - lightweight script for Polymarket trade data
- [Polymarket Indexer](https://github.com/enviodev/polymarket-indexer) - full HyperIndex indexer for Polymarket events
- [Track Polymarket Trades blog post](https://docs.envio.dev/blog/track-polymarket-trades-hypersync) - step-by-step walkthrough of how to build Polymarket trade tracking with HyperSync

## Documentation

- [HyperSync Docs](https://docs.envio.dev/docs/HyperSync/overview)
- [API Tokens](https://docs.envio.dev/docs/HyperSync/api-tokens)

## Support

- [Discord community](https://discord.com/invite/envio)
- [Envio Docs](https://docs.envio.dev)
