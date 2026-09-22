(() => {
    /* Torbed for Kettu - SPDX-License-Identifier: GPL-3.0-or-later
     * File must start with (() => { on line 1 (Kettu wraps as vendetta => { return <file> }). */

    const ONION_URL_RE =
        /https?:\/\/(?:[a-z0-9-]+\.)*[a-z2-7]{16,56}\.onion(?::\d{1,5})?(?:\/[^\s<>"'`\]\)]*)?/gi;

    const MAX_PER_MESSAGE = 3;
    const EMBED_COLOR = 0x7d4698;
    const PROVIDER_NAME = "Torbed";

    const patches = [];

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
        } catch (_) {
            return url;
        }
    }

    function isTorbedEmbed(embed, url) {
        return !!(
            embed &&
            embed.provider &&
            embed.provider.name === PROVIDER_NAME &&
            (!url || embed.url === url)
        );
    }

    function hasTorbedEmbed(message, url) {
        return Array.isArray(message.embeds) && message.embeds.some(e => isTorbedEmbed(e, url));
    }

    function makeEmbed(url) {
        return {
            id: `torbed-${hostnameOf(url)}`,
            type: "rich",
            url,
            title: hostnameOf(url),
            description: url,
            color: EMBED_COLOR,
            provider: { name: PROVIDER_NAME },
            fields: [],
        };
    }

    function addTorbedEmbeds(message) {
        if (!message || typeof message.content !== "string") return false;
        const urls = extractOnionUrls(message.content).slice(0, MAX_PER_MESSAGE);
        if (!urls.length) return false;

        if (!Array.isArray(message.embeds)) message.embeds = [];

        let changed = false;
        for (const url of urls) {
            if (hasTorbedEmbed(message, url)) continue;
            message.embeds.push(makeEmbed(url));
            changed = true;
        }
        return changed;
    }

    function handlePayload(payload) {
        if (!payload || typeof payload.type !== "string") return;
        try {
            switch (payload.type) {
                case "MESSAGE_CREATE":
                case "MESSAGE_UPDATE":
                    if (payload.message) addTorbedEmbeds(payload.message);
                    break;
                case "LOAD_MESSAGES_SUCCESS":
                case "LOAD_MESSAGES_AROUND_SUCCESS":
                case "LOAD_RECENT_MENTIONS_SUCCESS":
                    if (Array.isArray(payload.messages)) {
                        for (const msg of payload.messages) addTorbedEmbeds(msg);
                    }
                    break;
            }
        } catch (e) {
            try {
                vendetta.logger.error("Torbed payload error", e);
            } catch (_) {}
        }
    }

    function getDispatcher() {
        try {
            const fromCommon = vendetta.metro?.common?.FluxDispatcher;
            if (fromCommon && typeof fromCommon.dispatch === "function") return fromCommon;
        } catch (_) {}
        try {
            return vendetta.metro.findByProps("dispatch", "subscribe");
        } catch (_) {}
        return null;
    }

    function scanCachedMessages(Dispatcher) {
        try {
            const MessageStore =
                vendetta.metro.findByStoreName?.("MessageStore") ||
                vendetta.metro.findByProps("getMessage", "getMessages");
            if (!MessageStore?.getMessages) return;

            const channelIds = new Set();
            try {
                const Selected =
                    vendetta.metro.findByStoreName?.("SelectedChannelStore") ||
                    vendetta.metro.findByProps("getChannelId", "getVoiceChannelId");
                const id = Selected?.getChannelId?.();
                if (id) channelIds.add(id);
            } catch (_) {}

            for (const channelId of channelIds) {
                const bag = MessageStore.getMessages(channelId);
                const list = bag?._array || bag?.toArray?.() || (Array.isArray(bag) ? bag : null);
                if (!Array.isArray(list)) continue;
                for (const msg of list) {
                    if (!addTorbedEmbeds(msg)) continue;
                    // nudge UI without looping forever (provider tag dedupes)
                    try {
                        Dispatcher.dispatch({
                            type: "MESSAGE_UPDATE",
                            message: {
                                id: msg.id,
                                channel_id: msg.channel_id || channelId,
                                content: msg.content,
                                embeds: msg.embeds,
                            },
                        });
                    } catch (_) {}
                }
            }
        } catch (e) {
            try {
                vendetta.logger.error("Torbed scan failed", e);
            } catch (_) {}
        }
    }

    return {
        onLoad() {
            const Dispatcher = getDispatcher();
            if (!Dispatcher) {
                try {
                    vendetta.logger.error("Torbed: FluxDispatcher not found");
                } catch (_) {}
                return;
            }

            // Preferred: vendetta patcher (Revenge / modern Kettu)
            if (vendetta.patcher?.before) {
                patches.push(
                    vendetta.patcher.before("dispatch", Dispatcher, args => {
                        handlePayload(args?.[0]);
                    })
                );
            } else if (typeof Dispatcher.addInterceptor === "function") {
                const cancel = Dispatcher.addInterceptor(payload => {
                    handlePayload(payload);
                    return false;
                });
                patches.push(typeof cancel === "function" ? cancel : () => {});
            } else {
                // Legacy Vendetta interceptors array
                const interceptor = payload => {
                    handlePayload(payload);
                    return false;
                };
                (Dispatcher._interceptors ??= []).unshift(interceptor);
                patches.push(() => {
                    if (!Dispatcher._interceptors) return;
                    Dispatcher._interceptors = Dispatcher._interceptors.filter(i => i !== interceptor);
                });
            }

            // Catch messages already on screen
            setTimeout(() => scanCachedMessages(Dispatcher), 800);

            try {
                vendetta.logger.log("Torbed loaded");
            } catch (_) {}
        },

        onUnload() {
            while (patches.length) {
                try {
                    patches.pop()();
                } catch (_) {}
            }
            try {
                vendetta.logger.log("Torbed unloaded");
            } catch (_) {}
        },
    };
})()
