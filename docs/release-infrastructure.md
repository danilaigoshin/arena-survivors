# Release infrastructure

Arena Survivors 1.0 is a static PWA. GitHub Pages can host the entire solo game, save data stays in the browser, and the service worker makes previously loaded game assets available offline.

## Co-op connectivity

Co-op is host-authoritative WebRTC. Public Nostr relays handle peer discovery; gameplay data is encrypted and sent directly between browsers whenever the network allows it.

For reliable public matchmaking, configure a TURN relay in the deployment environment:

```text
VITE_TURN_URLS=turns:turn.example.com:5349
VITE_TURN_USERNAME=arena-user
VITE_TURN_CREDENTIAL=replace-me
```

Multiple URLs may be comma-separated. The build passes them to Trystero as `turnConfig`; its default STUN servers remain enabled. TURN credentials in `VITE_*` variables are visible in the client bundle, so a public production service should use limited/rotated credentials or add a small credential endpoint that issues short-lived TURN credentials before joining a room.

The game degrades safely without TURN: solo and offline play are unaffected, co-op is marked beta, and a disconnected player can claim the partial run reward calculated from the latest synchronized state.

## Release checklist

1. Run `npm ci`, `npm test`, and `npm run build`.
2. Test first-run tutorial, continue checkpoint, backup import, and a complete 20-wave run.
3. Test co-op in two browsers and on two separate networks; verify an invite URL and forced disconnect recovery.
4. If TURN is configured, verify a relay candidate in browser WebRTC diagnostics.
5. Deploy `dist/` over HTTPS and confirm the manifest and service worker are served from the same base path.
6. Bump `APP_VERSION`, `package.json`, and the service-worker cache name together for the next release.
