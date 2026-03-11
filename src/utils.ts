// ─── Utilities ──────────────────────────────────────────────────────────────

export const usdcFromRaw = (raw: string) => Number(raw) / 1e6;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const shortAddr = (a: string) =>
  a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;

export const tradeKey = (
  tx: string,
  orderHash: string,
  maker: string,
  makerAssetId: string,
  makerAmountFilled: string,
  takerAssetId: string,
  takerAmountFilled: string,
) =>
  `${tx}-${orderHash}-${maker}-${makerAssetId}-${makerAmountFilled}-${takerAssetId}-${takerAmountFilled}`;

export const parseAddressInput = (rawValue: string): string[] | null => {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) return [];

  const parsed = trimmed
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);

  if (parsed.length === 0) return [];

  const allValid = parsed.every((a) => a.startsWith("0x") && a.length >= 10);
  if (!allValid) return null;

  return Array.from(new Set(parsed));
};
