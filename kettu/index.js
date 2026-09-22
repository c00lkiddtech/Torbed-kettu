(() => {
    /* Torbed for Kettu - port of the Torbed Vencord/Equicord desktop plugin.
     * SPDX-License-Identifier: GPL-3.0-or-later
     * Kettu evaluates this file as `vendetta => { return <file contents> }`, so the
     * whole file is one expression evaluating to the plugin object. The IIFE must
     * begin on the very first line: any newline before it (even inside a comment)
     * triggers ASI after `return` and the plugin evaluates to undefined.
     *
     * Mobile limitation: React Native cannot route requests through Tor's SOCKS
     * proxy and .onion names do not resolve on public DNS, so unlike the desktop
     * version this cannot fetch Open Graph previews. It injects a native rich
     * embed for each onion link (host, link, color) so the link is visible and
     * tappable, and notes that previews need the desktop plugin. */

    // Same matching rules as the desktop plugin (Torbed/index.tsx).
    const ONION_URL_RE =
        /https?:\/\/(?:[a-z0-9-]+\.)*[a-z2-7]{16,56}\.onion(?::\d{1,5})?(?:\/[^\s<>"'`\]\)]*)?/gi;

    const MAX_PER_MESSAGE = 3;
    const EMBED_COLOR = 0x7d4698; // same purple pill as the desktop card
    const PROVIDER_NAME = "Torbed";

    function extractOnionUrls(content) {
        if (typeof content !== "string" || !content) return [];
        ONION_URL_RE.lastIndex = 0;
        const seen = new Set();
        const out = [];
        let match;
        while ((match = ONION_URL_RE.exec(content)) !== null) {
            const url = match[0].replace(/[),.;!?]+$/g, "");
            if (seen.has(url)) continue;
            seen.add(url);
            out.push(url);
        }
        return out;
    }

    function hostnameOf(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    }

    function hasTorbedEmbed(message, url) {
        if (!Array.isArray(message.embeds)) return false;
        return message.embeds.some(
            e => e && e.provider && e.provider.name === PROVIDER_NAME && e.url === url
        );
    }

    function addTorbedEmbeds(message) {
        if (!message || typeof message.content !== "string") return;
        const urls = extractOnionUrls(message.content).slice(0, MAX_PER_MESSAGE);
        if (!urls.length) return;

        if (!Array.isArray(message.embeds)) message.embeds = [];

        for (const url of urls) {
            if (hasTorbedEmbed(message, url)) continue;
            message.embeds.push({
                type: "rich",
                url,
                title: hostnameOf(url),
                description:
                    "Onion link. Open it in Tor Browser - mobile previews need the desktop Torbed plugin.",
                color: EMBED_COLOR,
                provider: { name: PROVIDER_NAME },
            });
        }
    }

    function handleEvent(payload) {
        try {
            if (!payload || typeof payload.type !== "string") return false;
            switch (payload.type) {
                case "MESSAGE_CREATE":
                case "MESSAGE_UPDATE":
                    addTorbedEmbeds(payload.message);
                    break;
                case "LOAD_MESSAGES_SUCCESS":
                    if (Array.isArray(payload.messages)) {
                        payload.messages.forEach(addTorbedEmbeds);
                    }
                    break;
            }
        } catch (e) {
            vendetta.logger?.error?.("Torbed: dispatcher interceptor failed", e);
        }
        // Never block the event.
        return false;
    }

    let activeInterceptor = null;

    return {
        onLoad() {
            const { FluxDispatcher } = vendetta.metro.common;
            if (!FluxDispatcher) {
                vendetta.logger?.error?.("Torbed: FluxDispatcher not found, plugin cannot start");
                return;
            }
            activeInterceptor = handleEvent;
            (FluxDispatcher._interceptors ??= []).unshift(activeInterceptor);
            vendetta.logger?.log?.("Torbed loaded: embedding onion links");
        },

        onUnload() {
            const { FluxDispatcher } = vendetta.metro.common;
            if (activeInterceptor && FluxDispatcher?._interceptors) {
                FluxDispatcher._interceptors = FluxDispatcher._interceptors.filter(
                    i => i !== activeInterceptor
                );
            }
            activeInterceptor = null;
            vendetta.logger?.log?.("Torbed unloaded");
        },
    };
})()
