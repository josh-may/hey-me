# hey me.

A tiny, private capture app for sending ideas to your own [HEY](https://www.hey.com/) inbox.

Install it on an Android phone as a progressive web app. It also appears in the share menu, so you can send selected text and links to yourself without opening your email.

Hey Me uses one Node server, the HEY CLI, and Tailscale. It has no runtime dependencies, framework, build tool, or database.

## What you need

- Node.js 22.13 or newer
- A HEY account
- The authenticated [HEY CLI](https://www.hey.com/agents/)
- Tailscale on the computer running Hey Me and on your phone

## Quick start

Install and authenticate the HEY CLI if you have not already:

```bash
curl -fsSL https://hey.com/install-cli | bash
hey setup
```

Clone and configure Hey Me:

```bash
git clone https://github.com/josh-may/hey-me.git
cd hey-me
cp .env.example .env
hey accounts list
```

Open `.env`. Replace the example account ID and email address with the values from your HEY account:

```dotenv
HEY_ACCOUNT_ID=123456
HEY_CAPTURE_ADDRESS=you@example.com
CAPTURE_ALLOWED_ORIGIN=
```

Start the app:

```bash
npm start
```

Hey Me now runs at `http://127.0.0.1:4327`.

## Open it on your phone

In another terminal, expose Hey Me only to your private tailnet:

```bash
tailscale serve --bg http://127.0.0.1:4327
```

The command prints a private HTTPS URL. Open that URL in Chrome on Android, then choose **Add to Home screen**.

To restrict submissions to that exact URL, copy its origin into `.env` and restart Hey Me:

```dotenv
CAPTURE_ALLOWED_ORIGIN=https://your-device-name.your-tailnet.ts.net
```

The installed app accepts shared text and links from Android's share menu.

## Try the interface without sending email

```bash
npm run dev
```

Dry-run mode exercises the complete interface but does not call the HEY CLI.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HEY_ACCOUNT_ID` | required | Account ID shown by `hey accounts list` |
| `HEY_CAPTURE_ADDRESS` | required | HEY address that receives captures |
| `CAPTURE_HOST` | `127.0.0.1` | Address the server listens on |
| `CAPTURE_PORT` | `4327` | Port the server listens on |
| `CAPTURE_ALLOWED_ORIGIN` | empty | Exact HTTPS origin allowed to submit captures |
| `HEY_BINARY` | `~/.local/bin/hey` | Path to the HEY CLI |
| `HEY_CAPTURE_DRY_RUN` | `0` | Set to `1` to skip sending |

Keep the server bound to `127.0.0.1`. Tailscale Serve provides private HTTPS access without exposing the app directly to the internet.

## Test

```bash
npm test
```

## License

MIT
