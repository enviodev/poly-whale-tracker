#!/usr/bin/env node

import blessed from "blessed";
import { parseArgs } from "./cli";
import { loadStoredApiKey, saveApiKey, setApiToken } from "./config";
import { initializeHyperSync, getClient, getDecoder } from "./hypersync";
import { createStartupPrompt } from "./ui/startup";

// ─── Main Application ───────────────────────────────────────────────────────

const createScreen = () => {
  return blessed.screen({
    smartCSR: true,
    title: "Polymarket Whale Tracker",
    fullUnicode: true,
  });
};

const validateApiKey = async (apiKey: string): Promise<boolean> => {
  const trimmed = apiKey.trim();

  // Basic format validation
  if (!trimmed.match(/^[a-zA-Z0-9\-]+$/)) {
    return false;
  }

  // Try to initialize and test connection
  try {
    initializeHyperSync(trimmed);
    const client = getClient();
    if (!client) return false;
    await client.getHeight();
    return true;
  } catch (err) {
    return false;
  }
};

const initializeApp = async () => {
  const screen = createScreen();
  const startup = createStartupPrompt(screen);

  // Parse CLI args early for later use
  const cliArgs = parseArgs(process.argv.slice(2));

  // Try to load existing API key
  let apiKey = loadStoredApiKey();

  const processApiKey = async (providedKey: string) => {
    const trimmed = providedKey.trim();

    if (!trimmed) {
      startup.setErrorMessage("{red-fg}API key cannot be empty{/red-fg}");
      startup.readInput();
      return;
    }

    startup.setStatusMessage(
      "Validating API key...\n{gray-fg}Initializing HyperSync{/gray-fg}",
    );

    const isValid = await validateApiKey(trimmed);
    if (!isValid) {
      startup.setErrorMessage(
        "{red-fg}Failed to validate API key. Check your key and try again.{/red-fg}",
      );
      startup.setStatusMessage(
        "Enter your HyperSync API key to continue.\n{gray-fg}This will be saved to ~/.hypersync/.env{/gray-fg}",
      );
      startup.readInput();
      return;
    }

    const saved = saveApiKey(trimmed);
    if (!saved) {
      startup.setErrorMessage(
        "{yellow-fg}API key validated but couldn't save to disk{/yellow-fg}",
      );
    }

    setApiToken(trimmed);
    apiKey = trimmed;

    startup.hide();
    startup.cleanup();

    // Import and run the main app (in separate module for modularity)
    const { bootUI } = await import("./ui/main");
    bootUI(screen, cliArgs);
  };

  startup.input.on("submit", (value) => {
    void processApiKey(String(value ?? ""));
  });

  startup.input.on("cancel", () => {
    process.exit(0);
  });

  screen.render();

  // If we have a stored key, try to use it
  if (apiKey) {
    startup.input.setValue(apiKey);
    const isValid = await validateApiKey(apiKey);
    if (isValid) {
      setApiToken(apiKey);
      startup.hide();
      startup.cleanup();
      const { bootUI } = await import("./ui/main");
      bootUI(screen, cliArgs);
      return;
    }
  }

  // Otherwise, show the prompt
  startup.focus();
  startup.readInput();
};

// Start the application
initializeApp().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
