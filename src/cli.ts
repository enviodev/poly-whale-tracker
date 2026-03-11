import type { CliArgs } from "./types";

// ─── CLI Arguments ──────────────────────────────────────────────────────────

export const parseArgs = (argv: string[]): CliArgs => {
  let threshold = 100;
  let addresses: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "-t" || arg === "--threshold") && argv[i + 1]) {
      const val = Number(argv[i + 1]);
      if (!isNaN(val) && val > 0) threshold = val;
      i++;
    } else if ((arg === "-a" || arg === "--addresses") && argv[i + 1]) {
      addresses = argv[i + 1]!
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter((a) => a.startsWith("0x") && a.length >= 10);
      i++;
    }
  }

  return { threshold, addresses };
};
