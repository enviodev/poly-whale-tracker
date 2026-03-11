import blessed from "blessed";

// ─── Startup Prompt ─────────────────────────────────────────────────────────

export type StartupPromptCallbacks = {
  onSubmit: (apiKey: string) => Promise<void>;
  onCancel: () => void;
};

export const createStartupPrompt = (screen: blessed.Widgets.Screen): {
  prompt: blessed.Widgets.BoxElement;
  input: blessed.Widgets.TextboxElement;
  errorText: blessed.Widgets.TextElement;
  show: () => void;
  hide: () => void;
  setErrorMessage: (msg: string) => void;
  setStatusMessage: (msg: string) => void;
  focus: () => void;
  readInput: () => void;
  cleanup: () => void;
} => {
  const startupPrompt = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 70,
    height: 14,
    label: " {bold}HyperSync API Key{/bold} ",
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: "yellow" },
      fg: "white",
      bg: "black",
      label: { fg: "yellow" },
    },
    padding: { left: 2, right: 4 },
  });

  const startupText = blessed.text({
    parent: startupPrompt,
    top: 0,
    left: 0,
    width: "100%-6",
    tags: true,
    content:
      "Enter your HyperSync API key to continue.\n{gray-fg}This will be saved to ~/.hypersync/.env{/gray-fg}",
  });

  const startupInput = blessed.textbox({
    parent: startupPrompt,
    top: 3,
    left: 0,
    width: "100%-6",
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

  const startupError = blessed.text({
    parent: startupPrompt,
    top: 6,
    left: 0,
    width: "100%-6",
    height: 2,
    tags: true,
    content: "",
    style: { fg: "red" },
  });

  const startupHint = blessed.text({
    parent: startupPrompt,
    bottom: 0,
    left: 0,
    tags: true,
    content: "{gray-fg}Enter submit | Esc exit{/gray-fg}",
  });

  return {
    prompt: startupPrompt,
    input: startupInput,
    errorText: startupError,
    show: () => {
      startupPrompt.show();
      screen.render();
    },
    hide: () => {
      startupPrompt.hide();
      screen.render();
    },
    setErrorMessage: (msg: string) => {
      startupError.setContent(msg);
      screen.render();
    },
    setStatusMessage: (msg: string) => {
      startupText.setContent(msg);
      screen.render();
    },
    focus: () => startupInput.focus(),
    readInput: () => startupInput.readInput(),
    cleanup: () => {
      startupInput.destroy();
      startupText.destroy();
      startupError.destroy();
      startupHint.destroy();
    },
  };
};
