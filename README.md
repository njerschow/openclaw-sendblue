# clawdbot-sendblue

Text your [clawdbot](https://clawd.bot) via iMessage or SMS.

## Quick Start

### 1. Create a Sendblue Account

1. Go to [sendblue.co](https://sendblue.co) and sign up
2. Find these in your dashboard:
   - **API Key**
   - **API Secret**
   - **Your Sendblue phone number** (e.g., `+15551234567`)

### 2. Install the Plugin

```bash
git clone https://github.com/njerschow/clawdbot-sendblue ~/.clawdbot/extensions/sendblue
cd ~/.clawdbot/extensions/sendblue
npm install && npm run build
```

### 3. Configure

Add this to `~/.clawdbot/clawdbot.json`:

```json
{
  "plugins": {
    "entries": {
      "sendblue": {
        "enabled": true,
        "config": {
          "apiKey": "your-api-key",
          "apiSecret": "your-api-secret",
          "phoneNumber": "+15551234567",
          "allowFrom": ["+15559876543"],
          "webhookPath": "/webhook/sendblue"
        }
      }
    }
  }
}
```

**Replace:**
| Field | What to put |
|-------|-------------|
| `apiKey` | Your Sendblue API key |
| `apiSecret` | Your Sendblue API secret |
| `phoneNumber` | The Sendblue number (from your dashboard) |
| `allowFrom` | **Your phone number** (the one you'll text from) |

### 4. Set Up Webhooks (Recommended)

For **instant message delivery**, configure Sendblue to send webhooks:

1. In your Sendblue dashboard, set the webhook URL to:
   ```
   https://your-clawdbot-domain:18789/webhook/sendblue
   ```
2. The plugin will receive messages in real-time (no polling delay)

> **Note:** Requires your Clawdbot gateway to be publicly accessible. Use ngrok, Cloudflare Tunnel, or Tailscale if running locally.

If you can't use webhooks, remove `webhookPath` and the plugin will fall back to polling every 5 seconds.

### 5. Restart & Test

```bash
clawdbot gateway restart
```

Text the Sendblue number from your phone. You should get a reply from clawdbot!

---

## Features

- ✅ **Instant delivery** via webhooks (or polling fallback)
- ✅ **Typing indicators** - shows "typing..." bubble when agent is replying
- ✅ **Read receipts** - marks messages as read
- ✅ **Media support** - send and receive images
- ✅ **Allowlist** - control who can message the bot

---

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `apiKey` | Sendblue API key | (required) |
| `apiSecret` | Sendblue API secret | (required) |
| `phoneNumber` | Sendblue phone number | (required) |
| `allowFrom` | Phone numbers that can text the bot | `[]` |
| `dmPolicy` | `"allowlist"`, `"open"`, or `"disabled"` | `"allowlist"` |
| `webhookPath` | Webhook endpoint path (enables webhook mode) | (none = polling) |
| `webhookSecret` | Secret to verify webhook requests | (none) |
| `pollIntervalMs` | Polling interval in ms (if not using webhooks) | `5000` |

### DM Policies

- `"allowlist"` (default) - Only numbers in `allowFrom` can message
- `"open"` - Anyone can message the bot
- `"disabled"` - Bot won't respond to DMs

---

## Webhook vs Polling

| Mode | Latency | Setup |
|------|---------|-------|
| **Webhook** | Instant | Requires public URL |
| **Polling** | Up to 5s delay | Works anywhere |

The plugin automatically uses webhook mode when `webhookPath` is configured, otherwise falls back to polling.

---

## Troubleshooting

**No response?**
- Make sure you're texting **from** a number in `allowFrom`
- Check logs: `clawdbot logs`
- Verify API credentials are correct

**Webhook not receiving?**
- Ensure your gateway is publicly accessible
- Check the webhook URL in Sendblue dashboard matches your config
- Look for connection errors in `clawdbot logs`

**"Unknown channel id" error?**
- Run `npm run build` in the plugin folder
- Restart the gateway: `clawdbot gateway restart`

---

## License

MIT
