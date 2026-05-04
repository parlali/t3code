# T3 Code

T3 Code is a minimal web GUI for coding agents (currently Codex, Claude, and OpenCode, more coming soon).

## Fork direction

This fork is being shaped around a self-hosted workflow: one persistent T3 Code instance runs on a trusted machine, while browser clients connect to it over a private network. The goal is for the server to be the central code and agent surface, with clients acting as UI shells.

For macOS hosts, the intended production shape is a user `launchd` service that can survive browser disconnects, terminal exits, and machine restarts. A public-safe starter template lives at [`scripts/launchd/t3-origin.template.zsh`](./scripts/launchd/t3-origin.template.zsh). Copy it outside the repo, set host-specific values through environment variables, and keep generated plist files, local logs, tailnet addresses, and machine paths out of commits.

The template is intentionally generic. The installed script on any actual host can add local conveniences such as restart helpers, Tailscale Serve wiring, smoke-test labels, or stricter health checks without exposing those details in the public fork.

## Installation

> [!WARNING]
> T3 Code currently supports Codex, Claude, and OpenCode.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Run without installing

```bash
npx t3
```

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Arch Linux (AUR)

```bash
yay -S t3code-bin
```

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

Observability guide: [docs/observability.md](./docs/observability.md)

## If you REALLY want to contribute still.... read this first

Before local development, prepare the environment and install dependencies:

```bash
# Optional: only needed if you use mise for dev tool management.
mise install
bun install .
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
