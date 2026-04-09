# openclaw-sendblue

Text your [openclaw](https://openclaw.ai) via iMessage or SMS, powered by [Sendblue](https://sendblue.com).

> **Also want Claude + iMessage without OpenClaw?** See [Alternative: Claude Code + Sendblue MCP](#alternative-claude-code--sendblue-mcp) below for a one-command setup.

## Quick Start

### 1. Get Your Sendblue Credentials

Install the [Sendblue CLI](https://sendblue.com/cli):

```bash
npm install -g @sendblue/cli
sendblue setup
```

This creates your account, assigns a phone number, and walks you through verifying your first contact. When done, print your credentials:

```bash
sendblue show-keys
```

Copy the **API Key**, **API Secret**, and **phone number** — you'll need all three in Step 3.

<details>
<summary>Already have an account? (dashboard method)</summary>

1. Go to [dashboard.sendblue.com](https://dashboard.sendblue.com)
2. **Settings → API Settings** — copy your **API Key** and **API Secret**
3. **Settings → Phone Lines** — copy your **Sendblue phone number**

</details>

### 2. Install the Plugin

```bash
git clone https://github.com/njerschow/openclaw-sendblue ~/.openclaw/extensions/sendblue
cd ~/.openclaw/extensions/sendblue
npm install && npm run build
```

### 3. Configure

Add this to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "sendblue": {
        "enabled": true,
        "config": {
          "apiKey": "paste-your-api-key",
          "apiSecret": "paste-your-api-secret",
          "phoneNumber": "+15551234567",
          "allowFrom": ["+15559876543"]
        }
      }
    }
  }
}
```

**Replace:**
| Field | What to put |
|-------|-------------|
| `apiKey` | Your Sendblue API key (from `sendblue show-keys`) |
| `apiSecret` | Your Sendblue API secret (from `sendblue show-keys`) |
| `phoneNumber` | The Sendblue number assigned to you (from `sendblue show-keys`) |
| `allowFrom` | **Your personal phone number** — the one you'll text from |

Phone numbers must use E.164 format (e.g., `+15551234567`).

### 4. Restart & Test

```bash
openclaw gateway restart
```

Text the Sendblue number from your phone. You should get a reply from openclaw!

---

## Alternative: Claude Code + Sendblue MCP

Don't need OpenClaw? You can give Claude Code iMessage/SMS capabilities directly with one command:

```bash
claude mcp add sendblue_api \
  --env SENDBLUE_API_API_KEY=your-api-key \
  --env SENDBLUE_API_API_SECRET=your-api-secret \
  -- npx -y sendblue-api-mcp --client=claude-code --tools=all
```

This adds the [Sendblue MCP server](https://docs.sendblue.com/mcp/) to Claude Code, giving it tools to send/receive iMessages, check number types, send group messages, and more — all from within your coding session.

**Or for Claude Desktop**, add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sendblue_api": {
      "command": "npx",
      "args": ["-y", "sendblue-api-mcp", "--client=claude", "--tools=all"],
      "env": {
        "SENDBLUE_API_API_KEY": "your-api-key",
        "SENDBLUE_API_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

---

## Troubleshooting

**No response?**
- Make sure you're texting **from** the number in `allowFrom`
- Check logs: `openclaw logs`
- Verify your API credentials are correct (`sendblue show-keys`)

**"Unknown channel id" error?**
- Run `npm run build` in the plugin folder

---

## Advanced Options

### Let Anyone Text the Bot

By default, only numbers in `allowFrom` can text the bot. To allow anyone:

```json
"config": {
  ...
  "dmPolicy": "open"
}
```

### Webhook Mode (Faster)

By default, the plugin checks for messages every 5 seconds. For instant delivery, enable webhooks:

```json
"config": {
  ...
  "webhook": {
    "enabled": true,
    "port": 3141,
    "secret": "your-secret-here"
  }
}
```

**Setup:**
1. Expose port 3141 to the internet (use ngrok, Cloudflare Tunnel, or a public server)
2. In your [Sendblue dashboard](https://dashboard.sendblue.com), set the webhook URL to `https://your-server/webhook/sendblue`
3. Set the same `secret` value for webhook authentication

**Security notes:**
- **Always set a secret** - Without it, anyone can send fake messages to your webhook
- **Use HTTPS** - Use a reverse proxy (nginx, Caddy) or tunnel service for SSL
- **Rate limiting** - Built-in at 60 req/min to prevent abuse

### All Options

| Option | Description |
|--------|-------------|
| `apiKey` | Sendblue API key (required) |
| `apiSecret` | Sendblue API secret (required) |
| `phoneNumber` | Sendblue phone number (required) |
| `allowFrom` | Phone numbers that can text the bot |
| `dmPolicy` | `"allowlist"` (default), `"open"`, or `"disabled"` |
| `pollIntervalMs` | Poll interval in ms (default: 5000) |
| `webhook.enabled` | Enable webhook server (default: false) |
| `webhook.port` | Webhook port (default: 3141) |
| `webhook.secret` | Secret for webhook authentication |
| `webhook.rateLimit.maxRequests` | Max requests per minute (default: 60) |

---

Built with [Sendblue](https://sendblue.com/cli) + [openclaw](https://openclaw.ai)

MIT License
