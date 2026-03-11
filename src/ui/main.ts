import blessed from "blessed";
import type { Query } from "@envio-dev/hypersync-client";
import type { ParsedTrade, CliArgs } from "../types";
import { shortAddr, usdcFromRaw, tradeKey, parseAddressInput } from "../utils";
import {
  EXCHANGE_ADDRESSES,
  ORDER_FILLED_TOPIC,
} from "../config";
import { getClient, getDecoder } from "../hypersync";
import { classifyTrade } from "../trades";
import { sleep } from "../utils";

// ─── State Variables ────────────────────────────────────────────────────────

let thresholdUsd = 100;
let watchAddresses: string[] = [];
let trades: ParsedTrade[] = [];
let selectedIndex = 0;
let isDetailView = false;
let isThresholdPopupOpen = false;
let isAddressPopupOpen = false;
let isPolling = false;
let pollAbort = false;
let queryFromResetBlock: number | null = null;
let resetCounter = 0;
const seen = new Set<string>();

// ─── Main UI Boot Function ──────────────────────────────────────────────────

export const bootUI = (screen: blessed.Widgets.Screen, cliArgs: CliArgs) => {
  // Initialize state from CLI args
  thresholdUsd = cliArgs.threshold;
  watchAddresses = cliArgs.addresses;

  // ─── Title Bar ──────────────────────────────────────────────────────────

  const titleBar = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    content: "{center}{bold}  POLYMARKET WHALE TRACKER  {/bold}{/center}",
    tags: true,
    style: {
      fg: "white",
      bg: "blue",
      bold: true,
    },
    border: { type: "line" },
  });

  // ─── Left Column: Threshold + Addresses ──────────────────────────────

  const leftCol = blessed.box({
    parent: screen,
    top: 3,
    left: 0,
    width: "30%",
    height: "100%-6",
  });

  const thresholdBox = blessed.box({
    parent: leftCol,
    top: 0,
    left: 0,
    width: "100%",
    height: 7,
    label: " {bold}Threshold (USD){/bold} ",
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

  const addressBox = blessed.box({
    parent: leftCol,
    top: 7,
    left: 0,
    width: "100%",
    height: "100%-7",
    label: " {bold}Watch Addresses{/bold} {gray-fg}(optional){/gray-fg} ",
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

  // ─── Right Column: Trade List ───────────────────────────────────────

  const tradeListBox = blessed.box({
    parent: screen,
    top: 3,
    left: "30%",
    right: 0,
    height: "100%-6",
    label: " {bold}Live Trades{/bold} ",
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
    bottom: 1,
    scrollable: true,
    mouse: true,
    keys: false,
    tags: true,
    scrollbar: {
      ch: "█",
      style: { bg: "green" },
    },
    style: {
      fg: "white",
      selected: {
        fg: "white",
        bg: "blue",
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

  // ─── Popups and Detail View ─────────────────────────────────────────

  const detailBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "70%",
    height: "70%",
    label: " {bold}Trade Details{/bold} ",
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

  const thresholdPopup = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 52,
    height: 11,
    label: " {bold}Set Threshold (USD){/bold} ",
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: "yellow" },
      fg: "white",
      bg: "black",
      label: { fg: "yellow" },
    },
    hidden: true,
    padding: { left: 1, right: 1 },
  });

  const thresholdPopupText = blessed.text({
    parent: thresholdPopup,
    top: 0,
    left: 0,
    right: 1,
    tags: true,
    content:
      "Enter a new minimum BUY value in USD\n{gray-fg}Applying clears current trades and restarts from latest blocks.{/gray-fg}",
  });

  const thresholdInput = blessed.textbox({
    parent: thresholdPopup,
    top: 3,
    left: 0,
    right: 1,
    height: 3,
    inputOnFocus: true,
    mouse: true,
    keys: true,
    border: { type: "line" },
    style: {
      border: { fg: "white" },
      fg: "white",
      bg: "black",
    },
  });

  const thresholdPopupError = blessed.text({
    parent: thresholdPopup,
    top: 6,
    left: 0,
    right: 1,
    height: 2,
    tags: true,
    content: "",
    style: { fg: "red" },
  });

  const thresholdPopupHint = blessed.text({
    parent: thresholdPopup,
    bottom: 0,
    left: 0,
    tags: true,
    content: "{gray-fg}Enter submit | Esc cancel{/gray-fg}",
  });

  const addressPopup = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 66,
    height: 12,
    label: " {bold}Set Watch Addresses{/bold} ",
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: "cyan" },
      fg: "white",
      bg: "black",
      label: { fg: "cyan" },
    },
    hidden: true,
    padding: { left: 1, right: 1 },
  });

  const addressPopupText = blessed.text({
    parent: addressPopup,
    top: 0,
    left: 0,
    right: 1,
    tags: true,
    content:
      "Enter comma-separated wallet addresses (0x...). Leave empty to clear filter.",
  });

  const addressInput = blessed.textbox({
    parent: addressPopup,
    top: 2,
    left: 0,
    right: 1,
    height: 4,
    inputOnFocus: true,
    mouse: true,
    keys: true,
    border: { type: "line" },
    style: {
      border: { fg: "white" },
      fg: "white",
      bg: "black",
    },
  });

  const addressPopupError = blessed.text({
    parent: addressPopup,
    top: 6,
    left: 0,
    right: 1,
    height: 2,
    tags: true,
    content: "",
    style: { fg: "red" },
  });

  const addressPopupHint = blessed.text({
    parent: addressPopup,
    bottom: 0,
    left: 0,
    tags: true,
    content: "{gray-fg}Enter submit | Esc cancel{/gray-fg}",
  });

  // ─── Help Bar ────────────────────────────────────────────────────────

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
    } else if (isThresholdPopupOpen) {
      helpBar.setContent(
        "{bold}{blue-fg}Enter{/blue-fg}{/bold} Apply threshold  " +
          "{bold}{blue-fg}Esc{/blue-fg}{/bold} Cancel  " +
          "{gray-fg}| applies immediately and clears old trades{/gray-fg}",
      );
    } else if (isAddressPopupOpen) {
      helpBar.setContent(
        "{bold}{blue-fg}Enter{/blue-fg}{/bold} Apply address filter  " +
          "{bold}{blue-fg}Esc{/blue-fg}{/bold} Cancel  " +
          "{gray-fg}| applies immediately and clears old trades{/gray-fg}",
      );
    } else {
      helpBar.setContent(
        "{bold}{blue-fg}↑/↓{/blue-fg}{/bold} Navigate  " +
          "{bold}{blue-fg}Enter{/blue-fg}{/bold} View details  " +
          "{bold}{blue-fg}T{/blue-fg}{/bold} Set threshold  " +
          "{bold}{blue-fg}A{/blue-fg}/{blue-fg}a{/blue-fg}{/bold} Set addresses  " +
          "{bold}{blue-fg}C{/blue-fg}{/bold} Clear trades  " +
          "{bold}{blue-fg}L{/blue-fg}{/bold} Latest trade  " +
          "{bold}{blue-fg}Q{/blue-fg}{/bold} Quit  " +
          "{gray-fg}|  -t <usd>  -a <addr1,addr2,...>{/gray-fg}",
      );
    }
    screen.render();
  };

  // ─── UI Rendering ───────────────────────────────────────────────────

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

  // ─── Popup Handlers ─────────────────────────────────────────────────

  const closeThresholdPopup = () => {
    isThresholdPopupOpen = false;
    thresholdPopup.hide();
    thresholdPopupError.setContent("");
    tradeList.focus();
    updateHelpBar();
    screen.render();
  };

  const applyThresholdFromInput = async (rawValue: string) => {
    const nextThreshold = Number(rawValue.trim());
    if (!Number.isFinite(nextThreshold) || nextThreshold <= 0) {
      thresholdPopupError.setContent(
        "{red-fg}Please enter a positive number, e.g. 500{/red-fg}",
      );
      screen.render();
      thresholdInput.readInput();
      return;
    }

    thresholdUsd = nextThreshold;
    trades = [];
    seen.clear();
    selectedIndex = 0;
    resetCounter += 1;

    const client = getClient();
    if (!client) return;
    const currentHeight = await client.getHeight();
    queryFromResetBlock = Math.max(0, currentHeight - 1);

    updateThresholdDisplay();
    renderTradeList();
    closeThresholdPopup();
  };

  const openThresholdPopup = () => {
    if (isDetailView || isThresholdPopupOpen || isAddressPopupOpen) return;

    isThresholdPopupOpen = true;
    thresholdPopupError.setContent("");
    thresholdInput.setValue(String(thresholdUsd));
    thresholdPopup.show();
    thresholdInput.focus();
    updateHelpBar();
    screen.render();
    thresholdInput.readInput();
  };

  const closeAddressPopup = () => {
    isAddressPopupOpen = false;
    addressPopup.hide();
    addressPopupError.setContent("");
    tradeList.focus();
    updateHelpBar();
    screen.render();
  };

  const applyAddressesFromInput = async (rawValue: string) => {
    const parsedAddresses = parseAddressInput(rawValue);
    if (parsedAddresses === null) {
      addressPopupError.setContent(
        "{red-fg}Invalid format. Use comma-separated 0x... addresses.{/red-fg}",
      );
      screen.render();
      addressInput.readInput();
      return;
    }

    watchAddresses = parsedAddresses;
    trades = [];
    seen.clear();
    selectedIndex = 0;
    resetCounter += 1;

    const client = getClient();
    if (!client) return;
    const currentHeight = await client.getHeight();
    queryFromResetBlock = Math.max(0, currentHeight - 1);

    updateAddressDisplay();
    renderTradeList();
    closeAddressPopup();
  };

  const openAddressPopup = () => {
    if (isDetailView || isThresholdPopupOpen || isAddressPopupOpen) return;

    isAddressPopupOpen = true;
    addressPopupError.setContent("");
    addressInput.setValue(watchAddresses.join(","));
    addressPopup.show();
    addressInput.focus();
    updateHelpBar();
    screen.render();
    addressInput.readInput();
  };

  // ─── Popup Event Handlers ───────────────────────────────────────────

  thresholdInput.on("submit", (value) => {
    void applyThresholdFromInput(String(value ?? ""));
  });

  thresholdInput.on("cancel", () => {
    closeThresholdPopup();
  });

  addressInput.on("submit", (value) => {
    void applyAddressesFromInput(String(value ?? ""));
  });

  addressInput.on("cancel", () => {
    closeAddressPopup();
  });

  // ─── Key Bindings ───────────────────────────────────────────────────

  screen.key(["q", "C-c"], () => {
    pollAbort = true;
    process.exit(0);
  });

  screen.key(["c"], () => {
    if (isThresholdPopupOpen || isAddressPopupOpen) return;
    if (!isDetailView) {
      trades = [];
      seen.clear();
      selectedIndex = 0;
      renderTradeList();
    }
  });

  screen.key(["t"], () => {
    openThresholdPopup();
  });

  screen.key(["a", "A", "S-a"], () => {
    openAddressPopup();
  });

  screen.key(["l", "home"], () => {
    if (isDetailView || isThresholdPopupOpen || isAddressPopupOpen) return;
    if (trades.length === 0) return;
    selectedIndex = 0;
    tradeList.select(0);
    statusLine.setContent(
      `{gray-fg}Threshold: $${thresholdUsd.toLocaleString()} | ${trades.length} trade${trades.length !== 1 ? "s" : ""} | 1/${trades.length}{/gray-fg}`,
    );
    screen.render();
  });

  screen.key(["up", "k"], () => {
    if (isDetailView || isThresholdPopupOpen || isAddressPopupOpen) return;
    if (trades.length === 0) return;
    selectedIndex = Math.max(0, selectedIndex - 1);
    tradeList.select(selectedIndex);
    statusLine.setContent(
      `{gray-fg}Threshold: $${thresholdUsd.toLocaleString()} | ${trades.length} trade${trades.length !== 1 ? "s" : ""} | ${selectedIndex + 1}/${trades.length}{/gray-fg}`,
    );
    screen.render();
  });

  screen.key(["down", "j"], () => {
    if (isDetailView || isThresholdPopupOpen || isAddressPopupOpen) return;
    if (trades.length === 0) return;
    selectedIndex = Math.min(trades.length - 1, selectedIndex + 1);
    tradeList.select(selectedIndex);
    statusLine.setContent(
      `{gray-fg}Threshold: $${thresholdUsd.toLocaleString()} | ${trades.length} trade${trades.length !== 1 ? "s" : ""} | ${selectedIndex + 1}/${trades.length}{/gray-fg}`,
    );
    screen.render();
  });

  screen.key(["enter", "return"], () => {
    if (isThresholdPopupOpen || isAddressPopupOpen) return;
    if (isDetailView) return;
    if (trades.length === 0) return;
    const trade = trades[selectedIndex];
    if (trade) showDetail(trade);
  });

  screen.key(["escape", "backspace"], () => {
    if (isThresholdPopupOpen) {
      closeThresholdPopup();
      return;
    }
    if (isAddressPopupOpen) {
      closeAddressPopup();
      return;
    }
    if (isDetailView) hideDetail();
  });

  // ─── Polling Loop ───────────────────────────────────────────────────

  const startPolling = async () => {
    const client = getClient();
    const decoder = getDecoder();
    if (isPolling || !client) return;
    isPolling = true;

    const currentHeight = await client.getHeight();
    let queryFrom = Math.max(0, currentHeight - 2);

    while (!pollAbort) {
      try {
        if (queryFromResetBlock !== null) {
          queryFrom = queryFromResetBlock;
          queryFromResetBlock = null;
        }

        const cycleResetCounter = resetCounter;

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
        const decodedLogs = decoder ? decoder.decodeLogsSync(logs) : [];
        let newCount = 0;

        for (let i = 0; i < logs.length; i++) {
          if (cycleResetCounter !== resetCounter) break;

          const log = logs[i];
          const dec = decodedLogs[i];
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
          selectedIndex = Math.min(trades.length - 1, selectedIndex + newCount);
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

  // ─── Initialize UI ──────────────────────────────────────────────────

  updateThresholdDisplay();
  updateAddressDisplay();
  renderTradeList();
  updateHelpBar();
  tradeList.focus();
  screen.render();

  startPolling();
};
