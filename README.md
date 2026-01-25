# clawdbot-sendblue

Text your [clawdbot](https://clawd.bot) via iMessage or SMS.

This plugin connects clawdbot to [Sendblue](https://sendblue.com/api), letting you chat with your AI assistant by texting a phone number.

## Prerequisites

- [clawdbot](https://clawd.bot) installed and running
- [Node.js](https://nodejs.org) 18+
- A Sendblue account (free tier available)

## Setup

### Step 1: Get Sendblue Credentials

1. Sign up at [sendblue.com/api](https://sendblue.com/api)
2. Go to **Dashboard → API Keys**
3. Copy your **API Key** (starts with `sb-api-key-`)
4. Copy your **API Secret** (starts with `sb-secret-`)
5. Note your **phone number** (shown in dashboard, format: `+15551234567`)

### Step 2: Install the Plugin

```bash
git clone https://github.com/njerschow/clawdbot-sendblue ~/.clawdbot/extensions/sendblue
cd ~/.clawdbot/extensions/sendblue
npm install
npm run build
```

### Step 3: Configure

Edit `~/.clawdbot/clawdbot.json` and add the plugin config:

```json
{
  "plugins": {
    "entries": {
      "sendblue": {
        "enabled": true,
        "config": {
          "apiKey": "sb-api-key-xxxxx",
          "apiSecret": "sb-secret-xxxxx",
          "phoneNumber": "+15551234567",
          "allowFrom": ["+15559876543"]
        }
      }
    }
  }
}
```

Replace:
- `apiKey` → your Sendblue API key
- `apiSecret` → your Sendblue API secret
- `phoneNumber` → your Sendblue phone number
- `allowFrom` → your personal phone number(s) that can text the bot

> **Note:** If you already have a `clawdbot.json`, merge this into your existing `plugins.entries` section.

### Step 4: Restart the Gateway

```bash
clawdbot gateway restart
```

### Step 5: Test It

Text your Sendblue number from your phone. You should get a response from clawdbot!

## Configuration Options

| Option | Required | Description |
|--------|----------|-------------|
| `apiKey` | Yes | Your Sendblue API key |
| `apiSecret` | Yes | Your Sendblue API secret |
| `phoneNumber` | Yes | Your Sendblue phone number |
| `allowFrom` | No | Phone numbers allowed to text the bot |
| `dmPolicy` | No | `"allowlist"` (default), `"open"`, or `"disabled"` |
| `pollIntervalMs` | No | Poll interval in ms (default: 5000) |

### Who Can Text the Bot?

By default, only numbers in `allowFrom` can text the bot. To let anyone text:

```json
{
  "plugins": {
    "entries": {
      "sendblue": {
        "enabled": true,
        "config": {
          "apiKey": "...",
          "apiSecret": "...",
          "phoneNumber": "...",
          "dmPolicy": "open"
        }
      }
    }
  }
}
```

## Troubleshooting

**"Unknown channel id" error**
- Make sure you ran `npm run build` after cloning
- Check that the plugin is in `~/.clawdbot/extensions/sendblue`

**Not receiving messages**
- Verify your phone number is in `allowFrom` (or set `dmPolicy` to `"open"`)
- Check that your Sendblue credentials are correct
- Check logs: `clawdbot logs`

**Messages not sending**
- Verify your Sendblue account is active
- Check your API credentials

## How It Works

```
Your Phone
    │
    ▼ iMessage/SMS
Sendblue (cloud)
    │
    ▼ polls every 5s
clawdbot + this plugin
    │
    ▼ AI response
Sendblue → Your Phone
```

## License

MIT
