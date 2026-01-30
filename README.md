# openclaw-sendblue

Text your [openclaw](https://openclaw.ai) via iMessage or SMS.

## Quick Start

### 1. Create a Sendblue Account

1. Go to [sendblue.com/api](https://sendblue.com/api) and click **"Try for free"**
2. After signing up, **verify your phone number** in the dashboard (required for free tier)
3. Find these three things in your dashboard:
   - **API Key**
   - **API Secret**
   - **Your Sendblue phone number** (e.g., `+15551234567`)

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
| `apiKey` | Your Sendblue API key |
| `apiSecret` | Your Sendblue API secret |
| `phoneNumber` | The Sendblue number (from your dashboard) |
| `allowFrom` | **Your phone number** (the one you'll text from) |

Phone numbers must start with `+1` (e.g., `+15551234567`).

### 4. Restart & Test

```bash
openclaw gateway restart
```

Now text the Sendblue number from your phone. You should get a reply from openclaw!

---

## Troubleshooting

**No response?**
- Make sure you're texting **from** the number in `allowFrom`
- Check logs: `openclaw logs`
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

**Setup:**
1. Expose port 3141 to the internet (use ngrok, Cloudflare Tunnel, or a public server)
2. In your Sendblue dashboard, set the webhook URL to `https://your-server/webhook/sendblue`
3. In Sendblue, set the same `secret` value for webhook authentication

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

## License

MIT
