# ChatGPT Usage

Shows ChatGPT plan limits and reset times in OpenCode Desktop and the TUI with `/limits`.

### Desktop

<p align="center">
  <img src="docs/screenshot.png" alt="ChatGPT Usage Desktop dialog">
</p>

### TUI

<p align="center">
  <img src="docs/tui-screenshot.png" alt="ChatGPT Usage TUI dialog">
</p>

## Install

```sh
opencode plugin add github:LeoSM-07/chatgpt-usage
```

## Login

This requires a legacy Codex login. Run `/connect`, choose **OpenAI**, then use
**Codex browser (legacy)** or **Codex device code (legacy)**. The newer
**Sign in with ChatGPT** login cannot access the usage endpoint.
