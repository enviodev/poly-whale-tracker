import type { TradeDirection, ParsedTrade } from "./types";
import { usdcFromRaw } from "./utils";

// ─── Trade Classification ───────────────────────────────────────────────────

export const classifyTrade = (args: {
  makerAssetId: string;
  takerAssetId: string;
  makerAmountFilled: string;
  takerAmountFilled: string;
  maker: string;
  taker: string;
}): {
  usdc: number;
  buyer: string | null;
  buyerSide: "maker" | "taker" | null;
  direction: TradeDirection;
} => {
  const {
    makerAssetId,
    takerAssetId,
    makerAmountFilled,
    takerAmountFilled,
    maker,
    taker,
  } = args;

  if (makerAssetId === "0") {
    return {
      usdc: usdcFromRaw(makerAmountFilled),
      buyer: maker,
      buyerSide: "maker",
      direction: "BUY",
    };
  } else if (takerAssetId === "0") {
    return {
      usdc: usdcFromRaw(takerAmountFilled),
      buyer: taker,
      buyerSide: "taker",
      direction: "SELL",
    };
  }

  return { usdc: 0, buyer: null, buyerSide: null, direction: "UNKNOWN" };
};

export const filterTrades = (
  trades: ParsedTrade[],
  threshold: number,
  watchAddresses: string[],
): ParsedTrade[] => {
  return trades.filter((trade) => {
    // Only show BUY trades above threshold
    if (trade.direction !== "BUY") return false;
    if (trade.usdc <= threshold) return false;

    // Filter by watched addresses if any are set
    if (watchAddresses.length > 0) {
      const matchesBuyer = trade.buyer && watchAddresses.includes(trade.buyer);
      const matchesMaker = watchAddresses.includes(trade.maker);
      const matchesTaker = watchAddresses.includes(trade.taker);
      if (!matchesBuyer && !matchesMaker && !matchesTaker) return false;
    }

    return true;
  });
};
