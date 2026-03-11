import { HypersyncClient, Decoder } from "@envio-dev/hypersync-client";
import { ENVIO_URL, ORDER_FILLED_SIG } from "./config";

// ─── HyperSync Client Management ─────────────────────────────────────────────

export let client: HypersyncClient | null = null;
export let decoder: Decoder | null = null;

export const initializeHyperSync = (apiToken: string) => {
  client = new HypersyncClient({
    url: ENVIO_URL,
    apiToken,
  });
  decoder = Decoder.fromSignatures([ORDER_FILLED_SIG]);
};

export const getClient = (): HypersyncClient | null => client;
export const getDecoder = (): Decoder | null => decoder;
