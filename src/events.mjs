import { GatewayDispatchEvents } from "@discordjs/core";
import { commands, DEFAULT_PREFIX } from "./commands.mjs";
import { db } from "./db.mjs";
import { logger } from "./logger.mjs";

export function registerEvents(client) {
    client.on(GatewayDispatchEvents.MessageCreate, async ({ api, data }) => {
        try {
            if (!data || data.author?.bot) return;

            const content = data.content?.trim();
            const channelId = data.channel_id;
            const guildId = data.guild_id;

            const guildSettings = guildId ? db.settings.get(guildId) : null;
            const prefix = guildSettings?.commandPrefix || DEFAULT_PREFIX;

            if (!content?.startsWith(prefix)) return;

            const args = content.split(" ");
            if (!args[0]) return;

            const cmd = args[0].slice(prefix.length).toLowerCase();
            if (!cmd) return;

            logger.info(`Command: ${cmd} | User: ${data.author.id} | Guild: ${guildId}`);

            if (guildId && !db.guildRoles.has(guildId)) {
                try {
                    const roles = await api.guilds.getRoles(guildId);
                    db.guildRoles.set(guildId, roles);
                } catch (err) {
                    logger.warn(`Guild rolleri yüklenemedi (${guildId}): ${err.message}`);
                }
            }

            const handler = commands[cmd];
            if (handler) {
                try {
                    await handler(api, data, args);
                } catch (err) {
                    logger.error(`Command error (${cmd})`, err);
                    try {
                        await api.channels.createMessage(channelId, {
                            content: `❌ Komut hatası: ${err.message}`,
                        });
                    } catch (e) {}
                }
            }
        } catch (err) {
            logger.error("MessageCreate error", err);
        }
    });

    client.on(GatewayDispatchEvents.Ready, async ({ data, api }) => {
        try {
            logger.info(`✅ Bot hazır: ${data.user.username} (ID: ${data.user.id})`);

            if (data.guilds && Array.isArray(data.guilds)) {
                logger.info(`${data.guilds.length} guild'de aktif`);
            }
        } catch (err) {
            logger.error("READY event error", err);
        }
    });



    client.on("error", (err) => {
        logger.error("Client error", err);
    });
}
