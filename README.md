# game-train

Build-your-own game show, in the spirit of _Game Changer_. The host's device
runs the show; players join by scanning a QR code and use their phones as
buzzers, answer pads and secret cards. Works in the same room, over a Discord
call, or with a Twitch audience.

Status: early. See [`docs/design.md`](docs/design.md) for the architecture and
milestones.

## Development

```sh
npm install
cp .env.example .env.local   # fill in Supabase settings (see supabase/README.md)
npm run dev
npm run check                # typecheck, lint, format, tests
```
