# Torbed for Kettu

Port of Torbed to **Kettu** (Discord mobile mod). Kettu installs Vendetta-format
plugins by URL, so this is written in that format and verified against Kettu's
plugin loader (`VdPluginManager`).

## what it does on mobile

Watches incoming messages for `.onion` links and attaches a native Discord rich
embed to each one (up to 3 per message) with the onion host, the link, and the
Torbed purple color, so the link is easy to see, tap, and copy.

## what it can't do on mobile

The desktop plugin fetches Open Graph previews through Tor's SOCKS proxy using
`curl`. On a phone there is no `curl`, React Native's `fetch` cannot use a
SOCKS proxy, and `.onion` names don't resolve on public DNS, so **live previews
are not possible on mobile**. The embed says so and points to Tor Browser /
the desktop plugin for previews.

## install

1. Open Discord with Kettu installed
2. Go to **Settings > Plugins** and tap **+**
3. Paste:

```
https://raw.githubusercontent.com/c00lkiddtech/Torbed/main/kettu
```

4. Confirm the "external source" prompt. Enable **Torbed**.

Kettu fetches `manifest.json` and `index.js` from that URL and re-fetches when
the `hash` in the manifest changes.

## how it works

Registers a Flux dispatcher interceptor (`MESSAGE_CREATE`, `MESSAGE_UPDATE`,
`LOAD_MESSAGES_SUCCESS`). Onion URLs found in message content get a synthetic
`type: "rich"` embed appended to `message.embeds`, tagged
`provider.name === "Torbed"` so re-dispatches never duplicate it. The event is
never blocked. `onUnload` removes the interceptor.

## dev / test

`index.js` is plain JS, no build step. Kettu evaluates the file as
`vendetta => { return <file contents> }`, so the file must start with the IIFE
on line 1 (a leading newline breaks it via ASI).

The logic was tested in Node against a mocked `vendetta` object using the same
eval wrapper Kettu uses (embed injection, dedupe, 3-per-message cap, partial
updates, unload cleanup). It has **not** been run on a real device yet.
