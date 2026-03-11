# Polymarket Whale Tracker TUI

A terminal UI that shows large BUY trades on Polymarket in real time.

## What It Does

- Streams Polymarket `OrderFilled` events from HyperSync
- Shows only BUY trades above your threshold
- Optionally filters by buyer/wallet addresses
- Lets you open a selected trade for detailed view

## Requirements

- Bun
- `ENVIO_API_TOKEN` in your environment

## Install

```bash
cd TUI
bun install
```

## Run

```bash
# Default threshold: 100, no address filter
bun index.ts

# Custom threshold
bun index.ts -t 500

# Threshold + address filter (comma-separated)
bun index.ts -t 500 -a "0xabc...,0xdef...,0x123..."
```

## CLI Flags

- `-t <number>`: USD threshold for BUY trades (default: `100`)
- `-a <addr1,addr2,...>`: Optional comma-separated addresses to filter trades

## Keyboard Controls

- `↑` / `↓` (or `k` / `j`): Move selection
- `Enter`: Open selected trade details
- `Esc` / `Backspace`: Return from details view
- `C`: Clear current trade list
- `Q` or `Ctrl+C`: Quit

## Notes

- If `-a` is not provided, all BUY trades above threshold are shown.
- Address filter matches buyer/maker/taker fields from decoded trade events.
