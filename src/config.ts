import * as fs from "fs";
import * as path from "path";

// ─── Configuration ──────────────────────────────────────────────────────────

export let ENVIO_API_TOKEN: string | null = process.env.ENVIO_API_TOKEN ?? null;
export const ENVIO_URL = process.env.ENVIO_URL ?? "https://polygon.hypersync.xyz";

export const HYPERSYNC_CONFIG_DIR = path.join(process.env.HOME ?? "~", ".hypersync");
export const HYPERSYNC_ENV_FILE = path.join(HYPERSYNC_CONFIG_DIR, ".env");

export const ORDER_FILLED_SIG =
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)";

export const EXCHANGE_ADDRESSES = [
  "0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e",
  "0xc5d563a36ae78145c45a50134d48a1215220f80a",
].map((a) => a.toLowerCase());

export const ORDER_FILLED_TOPIC =
  "0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec0f6";

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
      fs.mkdirSync(HYPERSYNC_CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(HYPERSYNC_ENV_FILE, `ENVIO_API_TOKEN=${apiKey}\n`);
    return true;
  } catch (err) {
    console.error("Failed to save API key:", err);
    return false;
  }
};

export const setApiToken = (token: string) => {
  ENVIO_API_TOKEN = token;
};
