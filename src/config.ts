import * as fs from "fs";
import * as path from "path";

// ─── Configuration ──────────────────────────────────────────────────────────

export let ENVIO_API_TOKEN: string | null = process.env.ENVIO_API_TOKEN ?? null;
export const ENVIO_URL = process.env.ENVIO_URL ?? "https://polygon.hypersync.xyz";

export const HYPERSYNC_CONFIG_DIR = path.join(process.env.HOME ?? "~", ".hypersync");
export const HYPERSYNC_ENV_FILE = path.join(HYPERSYNC_CONFIG_DIR, ".env");

// Polymarket CLOB v2 exchanges (https://docs.polymarket.com/resources/contracts)
export const ORDER_FILLED_SIG =
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint8 side, uint256 tokenId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee, bytes32 builder, bytes32 metadata)";

export const EXCHANGE_ADDRESSES = [
  "0xE111180000d2663C0091e4f400237545B87B996B", // CTF Exchange
  "0xe2222d279d744050d28e00520010520000310F59", // Neg Risk CTF Exchange
].map((a) => a.toLowerCase());

export const ORDER_FILLED_TOPIC =
  "0xd543adfd945773f1a62f74f0ee55a5e3b9b1a28262980ba90b1a89f2ea84d8ee";

// ─── API Key Management ──────────────────────────────────────────────────────

export const loadStoredApiKey = (): string | null => {
  try {
    if (fs.existsSync(HYPERSYNC_ENV_FILE)) {
      const content = fs.readFileSync(HYPERSYNC_ENV_FILE, "utf-8");
      const match = content.match(/^ENVIO_API_TOKEN=(.+)$/m);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch (err) {
    // Silently fail if file can't be read
  }
  return null;
};

export const saveApiKey = (apiKey: string): boolean => {
  try {
    if (!fs.existsSync(HYPERSYNC_CONFIG_DIR)) {
      fs.mkdirSync(HYPERSYNC_CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    // The key is a secret, so only the owner can read the file
    fs.writeFileSync(HYPERSYNC_ENV_FILE, `ENVIO_API_TOKEN=${apiKey}\n`, { mode: 0o600 });
    fs.chmodSync(HYPERSYNC_ENV_FILE, 0o600);
    return true;
  } catch (err) {
    console.error("Failed to save API key:", err);
    return false;
  }
};

export const setApiToken = (token: string) => {
  ENVIO_API_TOKEN = token;
};
