# clawdbot-sendblue

Text your [clawdbot](https://clawd.bot) via iMessage or SMS.

## Quick Start

### 1. Create a Sendblue Account

1. Go to [sendblue.com/api](https://sendblue.com/api) and click **"Try for free"**
2. After signing up, find these three things in your dashboard:
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
| `apiKey` | Your Sendblue API key |
| `apiSecret` | Your Sendblue API secret |
| `phoneNumber` | The Sendblue number (from your dashboard) |
| `allowFrom` | **Your phone number** (the one you'll text from) |

Phone numbers must start with `+1` (e.g., `+15551234567`).

### 4. Restart & Test

```bash
clawdbot gateway restart
```

Now text the Sendblue number from your phone. You should get a reply from clawdbot!

---

## Troubleshooting

**No response?**
- Make sure you're texting **from** the number in `allowFrom`
- Check logs: `clawdbot logs`
- Verify your API credentials are correct

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

Then configure Sendblue to send webhooks to `https://your-server:3141/webhook/sendblue`.

> **Security:** Set a `secret` and configure the same secret in your Sendblue dashboard. The webhook includes rate limiting (60 req/min by default).

> **HTTPS:** Use a reverse proxy (nginx, Caddy, or Cloudflare Tunnel) for SSL termination.

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

## License

MIT
