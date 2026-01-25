# clawdbot-sendblue

Text your [clawdbot](https://clawd.bot) via iMessage or SMS.

This plugin connects clawdbot to [Sendblue](https://sendblue.co), letting you chat with your AI assistant by texting a phone number.

**By default, only phone numbers you explicitly allow can text the bot.** Random people texting your Sendblue number will be ignored.

## Prerequisites

- [clawdbot](https://clawd.bot) installed and running
- [Node.js](https://nodejs.org) 18+
- A Sendblue account with API access

## Setup

### Step 1: Get Sendblue Credentials

1. Sign up at [sendblue.co](https://sendblue.co) and subscribe to get API access
2. Go to **Dashboard** and find your API credentials
3. Copy your **API Key** and **API Secret**
4. Note your **Sendblue phone number** (the number Sendblue assigned to you)

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
          "apiKey": "YOUR_SENDBLUE_API_KEY",
          "apiSecret": "YOUR_SENDBLUE_API_SECRET",
          "phoneNumber": "+15551234567",
          "allowFrom": ["+15559876543"]
        }
      }
    }
  }
}
```

Replace:
- `apiKey` - your Sendblue API key
- `apiSecret` - your Sendblue API secret
- `phoneNumber` - the Sendblue phone number (the one Sendblue gave you)
- `allowFrom` - **your personal phone number** (the phone you'll text from)

All phone numbers must be in E.164 format: `+1` followed by 10 digits (e.g., `+15551234567`).

> **Already have a `clawdbot.json`?** Just add the `sendblue` section inside your existing `plugins.entries` object.

### Step 4: Restart the Gateway

```bash
clawdbot gateway restart
```

### Step 5: Test It

Open your phone's messaging app and text your Sendblue number. You should get a response from clawdbot!

If you don't get a response, make sure you're texting **from** the number you put in `allowFrom`.

## Configuration Options

| Option | Required | Description |
|--------|----------|-------------|
| `apiKey` | Yes | Your Sendblue API key |
| `apiSecret` | Yes | Your Sendblue API secret |
| `phoneNumber` | Yes | The Sendblue phone number (the bot's number) |
| `allowFrom` | Recommended | Your phone number(s) that can text the bot |
| `dmPolicy` | No | `"allowlist"` (default), `"open"`, or `"disabled"` |
| `pollIntervalMs` | No | How often to check for new messages in ms (default: 5000) |

### Access Control

By default (`dmPolicy: "allowlist"`), only numbers listed in `allowFrom` can text the bot. Messages from other numbers are silently ignored.

To allow **anyone** to text the bot:

```json
"config": {
  "apiKey": "...",
  "apiSecret": "...",
  "phoneNumber": "...",
  "dmPolicy": "open"
}
```

To **disable** the channel entirely, set `dmPolicy: "disabled"`.

## Troubleshooting

**Not receiving messages**
- Make sure you're texting from a number in `allowFrom`
- Check that your Sendblue credentials are correct
- Check logs: `clawdbot logs`

**"Unknown channel id" error**
- Make sure you ran `npm run build` after cloning
- Check that the plugin is in `~/.clawdbot/extensions/sendblue`

**Messages not sending**
- Verify your Sendblue account is active and has API access
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

The plugin polls Sendblue for new messages every 5 seconds (configurable). When you text the Sendblue number, the plugin picks it up, sends it to clawdbot for processing, and sends the AI's response back via Sendblue.

## License

MIT
