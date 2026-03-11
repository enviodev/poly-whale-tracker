import blessed from "blessed";
import {
  HypersyncClient,
  Decoder,
  type Query,
} from "@envio-dev/hypersync-client";

// ─── Environment ────────────────────────────────────────────────────────────

const ENVIO_API_TOKEN = process.env.ENVIO_API_TOKEN;
if (!ENVIO_API_TOKEN) {
  console.error("ENVIO_API_TOKEN is required in env");
  process.exit(1);
}
const ENVIO_URL = process.env.ENVIO_URL ?? "https://polygon.hypersync.xyz";

// ─── Types ──────────────────────────────────────────────────────────────────

type TradeDirection = "BUY" | "SELL" | "UNKNOWN";

type ParsedTrade = {
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

// ─── HyperSync setup ───────────────────────────────────────────────────────

const client = new HypersyncClient({
  url: ENVIO_URL,
  apiToken: ENVIO_API_TOKEN,
});

const ORDER_FILLED_SIG =
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)";

const decoder = Decoder.fromSignatures([ORDER_FILLED_SIG]);

const EXCHANGE_ADDRESSES = [
  "0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e",
  "0xc5d563a36ae78145c45a50134d48a1215220f80a",
].map((a) => a.toLowerCase());

const ORDER_FILLED_TOPIC =
  "0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec0f6";

// ─── CLI Arguments ──────────────────────────────────────────────────────────

const parseArgs = (argv: string[]) => {
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

const cliArgs = parseArgs(process.argv.slice(2));

// ─── State ──────────────────────────────────────────────────────────────────

const thresholdUsd = cliArgs.threshold;
const watchAddresses = cliArgs.addresses;
let trades: ParsedTrade[] = [];
let selectedIndex = 0;
let isDetailView = false;
let isPolling = false;
let pollAbort = false;
const seen = new Set<string>();

// ─── Helpers ────────────────────────────────────────────────────────────────

const usdcFromRaw = (raw: string) => Number(raw) / 1e6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const shortAddr = (a: string) =>
  a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;

const tradeKey = (
  tx: string,
  orderHash: string,
  maker: string,
  makerAssetId: string,
  makerAmountFilled: string,
  takerAssetId: string,
  takerAmountFilled: string,
) =>
  `${tx}-${orderHash}-${maker}-${makerAssetId}-${makerAmountFilled}-${takerAssetId}-${takerAmountFilled}`;

// ─── Blessed Screen ─────────────────────────────────────────────────────────

const screen = blessed.screen({
  smartCSR: true,
  title: "Polymarket Whale Tracker",
  fullUnicode: true,
});

// ─── Title Bar ──────────────────────────────────────────────────────────────

const titleBar = blessed.box({
  parent: screen,
  top: 0,
  left: 0,
  width: "100%",
  height: 3,
  content: "{center}{bold} 🐋  POLYMARKET WHALE TRACKER  🐋 {/bold}{/center}",
  tags: true,
  style: {
    fg: "white",
    bg: "blue",
    bold: true,
  },
  border: { type: "line" },
});

// ─── Left Column: Threshold + Addresses ─────────────────────────────────────

const leftCol = blessed.box({
  parent: screen,
  top: 3,
  left: 0,
  width: "30%",
  height: "100%-6",
});

// Threshold box
const thresholdBox = blessed.box({
  parent: leftCol,
  top: 0,
  left: 0,
  width: "100%",
  height: 7,
  label: " {bold}💰 Threshold (USD){/bold} ",
  tags: true,
  border: { type: "line" },
  style: {
    border: { fg: "yellow" },
    fg: "white",
    label: { fg: "yellow" },
  },
  padding: { left: 1, right: 1 },
});

const thresholdDisplay = blessed.text({
  parent: thresholdBox,
  top: 0,
  left: 0,
  content: "",
  tags: true,
  style: { fg: "white" },
});

const updateThresholdDisplay = () => {
  thresholdDisplay.setContent(
    `{yellow-fg}{bold}$${thresholdUsd.toLocaleString()}{/bold}{/yellow-fg}\n\n{gray-fg}Only BUY trades above this{/gray-fg}`,
  );
  screen.render();
};

// Addresses box
const addressBox = blessed.box({
  parent: leftCol,
  top: 7,
  left: 0,
  width: "100%",
  height: "100%-7",
  label: " {bold}👁  Watch Addresses{/bold} {gray-fg}(optional){/gray-fg} ",
  tags: true,
  border: { type: "line" },
  style: {
    border: { fg: "cyan" },
    fg: "white",
    label: { fg: "cyan" },
  },
  padding: { left: 1, right: 1 },
});

const addressDisplay = blessed.text({
  parent: addressBox,
  top: 0,
  left: 0,
  tags: true,
  content: "",
  style: { fg: "white" },
});

const updateAddressDisplay = () => {
  if (watchAddresses.length === 0) {
    addressDisplay.setContent(
      "{gray-fg}No filter — showing all\nwhale BUY trades.\n\nUse {bold}-a{/bold} flag to filter.{/gray-fg}",
    );
  } else {
    const list = watchAddresses
      .map((a, i) => `{cyan-fg}${i + 1}.{/cyan-fg} ${shortAddr(a)}`)
      .join("\n");
    addressDisplay.setContent(
      `${list}\n\n{gray-fg}${watchAddresses.length} address${watchAddresses.length > 1 ? "es" : ""}{/gray-fg}`,
    );
  }
  screen.render();
};

// ─── Right Column: Trade List ───────────────────────────────────────────────

const tradeListBox = blessed.box({
  parent: screen,
  top: 3,
  left: "30%",
  width: "70%",
  height: "100%-6",
  label: " {bold}📊 Live Trades{/bold} ",
  tags: true,
  border: { type: "line" },
  style: {
    border: { fg: "green" },
    fg: "white",
    label: { fg: "green" },
  },
});

const tradeList = blessed.list({
  parent: tradeListBox,
  top: 0,
  left: 1,
  right: 1,
  bottom: 0,
  scrollable: true,
  mouse: true,
  keys: true,
  tags: true,
  scrollbar: {
    ch: "█",
    style: { bg: "green" },
  },
  style: {
    fg: "white",
    selected: {
      fg: "black",
      bg: "green",
      bold: true,
    },
    item: {
      fg: "white",
    },
  },
});

const statusLine = blessed.text({
  parent: tradeListBox,
  bottom: 0,
  left: 1,
  right: 1,
  height: 1,
  tags: true,
  content: "",
  style: { fg: "gray" },
});

// ─── Detail View (overlay) ──────────────────────────────────────────────────

const detailBox = blessed.box({
  parent: screen,
  top: "center",
  left: "center",
  width: "70%",
  height: "70%",
  label: " {bold}🔍 Trade Details{/bold} ",
  tags: true,
  border: { type: "line" },
  style: {
    border: { fg: "magenta" },
    fg: "white",
    bg: "black",
    label: { fg: "magenta" },
  },
  padding: { left: 2, right: 2, top: 1, bottom: 1 },
  hidden: true,
  scrollable: true,
  keys: true,
  mouse: true,
  scrollbar: {
    ch: "█",
    style: { bg: "magenta" },
  },
});

// ─── Help Bar ───────────────────────────────────────────────────────────────

const helpBar = blessed.box({
  parent: screen,
  bottom: 0,
  left: 0,
  width: "100%",
  height: 3,
  tags: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "#333333",
    border: { fg: "gray" },
  },
  padding: { left: 1, right: 1 },
});

const updateHelpBar = () => {
  if (isDetailView) {
    helpBar.setContent(
      "{bold}{blue-fg}Esc{/blue-fg}/{blue-fg}Backspace{/blue-fg}{/bold} Back to list  " +
        "{bold}{blue-fg}↑/↓{/blue-fg}{/bold} Scroll  " +
        "{bold}{blue-fg}Q{/blue-fg}{/bold} Quit",
    );
  } else {
    helpBar.setContent(
      "{bold}{blue-fg}↑/↓{/blue-fg}{/bold} Navigate  " +
        "{bold}{blue-fg}Enter{/blue-fg}{/bold} View details  " +
        "{bold}{blue-fg}C{/blue-fg}{/bold} Clear trades  " +
        "{bold}{blue-fg}Q{/blue-fg}{/bold} Quit  " +
        "{gray-fg}|  -t <usd>  -a <addr1,addr2,...>{/gray-fg}",
    );
  }
  screen.render();
};

// ─── Trade list rendering ───────────────────────────────────────────────────

const renderTradeList = () => {
  tradeList.clearItems();

  if (trades.length === 0) {
    tradeList.addItem(
      "{gray-fg}  Waiting for trades above threshold...{/gray-fg}" as any,
    );
    statusLine.setContent(
      `{gray-fg}Threshold: $${thresholdUsd.toLocaleString()} | 0 trades{/gray-fg}`,
    );
    screen.render();
    return;
  }

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]!;
    const dir =
      t.direction === "BUY"
        ? "{green-fg}{bold}BUY {/bold}{/green-fg}"
        : t.direction === "SELL"
          ? "{red-fg}{bold}SELL{/bold}{/red-fg}"
          : "{gray-fg}??? {/gray-fg}";
    const usd = `{yellow-fg}$${t.usdc.toFixed(2).padStart(12)}{/yellow-fg}`;
    const addr = shortAddr(t.buyer ?? t.maker);
    const time = t.timestamp.toLocaleTimeString();
    const line = ` ${dir} ${usd}  {cyan-fg}${addr}{/cyan-fg}  {gray-fg}${time}{/gray-fg}`;
    tradeList.addItem(line as any);
  }

  if (selectedIndex >= trades.length) selectedIndex = trades.length - 1;
  if (selectedIndex < 0) selectedIndex = 0;
  tradeList.select(selectedIndex);

  statusLine.setContent(
    `{gray-fg}Threshold: $${thresholdUsd.toLocaleString()} | ${trades.length} trade${trades.length !== 1 ? "s" : ""} | ${selectedIndex + 1}/${trades.length}{/gray-fg}`,
  );
  screen.render();
};

const showDetail = (trade: ParsedTrade) => {
  isDetailView = true;
  const dir =
    trade.direction === "BUY"
      ? "{green-fg}{bold}BUY{/bold}{/green-fg}"
      : trade.direction === "SELL"
        ? "{red-fg}{bold}SELL{/bold}{/red-fg}"
        : "{gray-fg}UNKNOWN{/gray-fg}";

  const content = [
    `{bold}Direction:{/bold}     ${dir}`,
    `{bold}USD Value:{/bold}     {yellow-fg}{bold}$${trade.usdc.toFixed(6)}{/bold}{/yellow-fg}`,
    ``,
    `{bold}Buyer:{/bold}         {cyan-fg}${trade.buyer ?? "unknown"}{/cyan-fg}`,
    `{bold}Buyer Side:{/bold}    ${trade.buyerSide ?? "unknown"}`,
    ``,
    `{bold}Maker:{/bold}         ${trade.maker}`,
    `{bold}Taker:{/bold}         ${trade.taker}`,
    ``,
    `{bold}Maker Asset:{/bold}   ${trade.makerAssetId}`,
    `{bold}Taker Asset:{/bold}   ${trade.takerAssetId}`,
    `{bold}Maker Filled:{/bold}  ${trade.makerAmountFilled}`,
    `{bold}Taker Filled:{/bold}  ${trade.takerAmountFilled}`,
    `{bold}Fee:{/bold}           ${trade.fee}`,
    ``,
    `{bold}Block:{/bold}         ${trade.blockNumber ?? "unknown"}`,
    `{bold}Order Hash:{/bold}    ${trade.orderHash}`,
    `{bold}Tx Hash:{/bold}       ${trade.txHash}`,
    `{bold}Polygonscan:{/bold}   https://polygonscan.com/tx/${trade.txHash}`,
    ``,
    `{bold}Detected:{/bold}      ${trade.timestamp.toLocaleString()}`,
  ].join("\n");

  detailBox.setContent(content);
  detailBox.show();
  detailBox.focus();
  updateHelpBar();
  screen.render();
};

const hideDetail = () => {
  isDetailView = false;
  detailBox.hide();
  tradeList.focus();
  updateHelpBar();
  screen.render();
};



// ─── Key bindings ───────────────────────────────────────────────────────────

screen.key(["q", "C-c"], () => {
  pollAbort = true;
  process.exit(0);
});

screen.key(["c"], () => {
  if (!isDetailView) {
    trades = [];
    seen.clear();
    selectedIndex = 0;
    renderTradeList();
  }
});

screen.key(["up", "k"], () => {
  if (isDetailView) return;
  if (trades.length === 0) return;
  selectedIndex = Math.max(0, selectedIndex - 1);
  tradeList.select(selectedIndex);
  statusLine.setContent(
    `{gray-fg}Threshold: $${thresholdUsd.toLocaleString()} | ${trades.length} trade${trades.length !== 1 ? "s" : ""} | ${selectedIndex + 1}/${trades.length}{/gray-fg}`,
  );
  screen.render();
});

screen.key(["down", "j"], () => {
  if (isDetailView) return;
  if (trades.length === 0) return;
  selectedIndex = Math.min(trades.length - 1, selectedIndex + 1);
  tradeList.select(selectedIndex);
  statusLine.setContent(
    `{gray-fg}Threshold: $${thresholdUsd.toLocaleString()} | ${trades.length} trade${trades.length !== 1 ? "s" : ""} | ${selectedIndex + 1}/${trades.length}{/gray-fg}`,
  );
  screen.render();
});

screen.key(["enter", "return"], () => {
  if (isDetailView) return;
  if (trades.length === 0) return;
  const trade = trades[selectedIndex];
  if (trade) showDetail(trade);
});

screen.key(["escape", "backspace"], () => {
  if (isDetailView) hideDetail();
});

// ─── Trade classification (same logic as collect_trades.ts) ─────────────────

const classifyTrade = (args: {
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

// ─── Polling loop ───────────────────────────────────────────────────────────

const startPolling = async () => {
  if (isPolling) return;
  isPolling = true;

  const currentHeight = await client.getHeight();
  let queryFrom = Math.max(0, currentHeight - 2);

  while (!pollAbort) {
    try {
      const query: Query = {
        fromBlock: queryFrom,
        logs: [
          {
            address: EXCHANGE_ADDRESSES,
            topics: [[ORDER_FILLED_TOPIC], [], [], []],
          },
        ],
        fieldSelection: {
          log: [
            "Data",
            "Address",
            "Topic0",
            "Topic1",
            "Topic2",
            "Topic3",
            "TransactionHash",
            "BlockNumber",
          ],
        },
      };

      const res = await client.get(query);
      const logs = (res.data as any).logs ?? [];
      const decoded = decoder.decodeLogsSync(logs);
      let newCount = 0;

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const dec = decoded[i];
        if (!dec) continue;

        const orderHash = String(dec.indexed?.[0]?.val ?? "");
        const maker = String(dec.indexed?.[1]?.val ?? "").toLowerCase();
        const taker = String(dec.indexed?.[2]?.val ?? "").toLowerCase();
        const makerAssetId = String(dec.body?.[0]?.val ?? "0");
        const takerAssetId = String(dec.body?.[1]?.val ?? "0");
        const makerAmountFilled = String(dec.body?.[2]?.val ?? "0");
        const takerAmountFilled = String(dec.body?.[3]?.val ?? "0");
        const fee = String(dec.body?.[4]?.val ?? "0");
        const tx = log.transactionHash;

        const key = tradeKey(
          tx,
          orderHash,
          maker,
          makerAssetId,
          makerAmountFilled,
          takerAssetId,
          takerAmountFilled,
        );
        if (seen.has(key)) continue;
        seen.add(key);

        const { usdc, buyer, buyerSide, direction } = classifyTrade({
          makerAssetId,
          takerAssetId,
          makerAmountFilled,
          takerAmountFilled,
          maker,
          taker,
        });

        // Only show BUY trades above threshold
        if (direction !== "BUY") continue;
        if (usdc <= thresholdUsd) continue;

        // Filter by watched addresses if any are set
        if (watchAddresses.length > 0) {
          const matchesBuyer = buyer && watchAddresses.includes(buyer);
          const matchesMaker = watchAddresses.includes(maker);
          const matchesTaker = watchAddresses.includes(taker);
          if (!matchesBuyer && !matchesMaker && !matchesTaker) continue;
        }

        const trade: ParsedTrade = {
          txHash: tx,
          blockNumber: log.blockNumber,
          orderHash,
          maker,
          taker,
          makerAssetId,
          takerAssetId,
          makerAmountFilled,
          takerAmountFilled,
          fee,
          buyer,
          buyerSide,
          direction,
          usdc,
          timestamp: new Date(),
        };

        trades.unshift(trade);
        newCount++;
      }

      if (newCount > 0) {
        selectedIndex = 0;
        renderTradeList();
      }

      // Wait for chain to advance
      let height = res.archiveHeight;
      while ((height ?? queryFrom) < res.nextBlock) {
        if (pollAbort) return;
        height = await client.getHeight();
        await sleep(1000);
      }
      queryFrom = res.nextBlock as number;
    } catch (err) {
      // Silently retry on transient errors
      await sleep(3000);
    }
  }
};

// ─── Boot ───────────────────────────────────────────────────────────────────

updateThresholdDisplay();
updateAddressDisplay();
renderTradeList();
updateHelpBar();
tradeList.focus();
screen.render();

startPolling();
