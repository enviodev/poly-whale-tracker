// ─── Types ──────────────────────────────────────────────────────────────────

export type TradeDirection = "BUY" | "SELL" | "UNKNOWN";

export type ParsedTrade = {
  txHash: string;
  blockNumber?: number;
  orderHash: string;
  maker: string;
  taker: string;
  makerAssetId: string;
  takerAssetId: string;
  makerAmountFilled: string;
  takerAmountFilled: string;
  fee: string;
  buyer: string | null;
  buyerSide: "maker" | "taker" | null;
  direction: TradeDirection;
  usdc: number;
  timestamp: Date;
};

export type CliArgs = {
  threshold: number;
  addresses: string[];
};
