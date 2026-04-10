import { db } from "./db.mjs";
import { logger } from "./logger.mjs";

export async function logModAction(api, guildId, embed) {
    const settings = db.settings.get(guildId);
    const modlogChannel = settings?.modlogChannel;

    if (!modlogChannel) return;

    try {
        await api.channels.createMessage(modlogChannel, {
            embeds: [embed],
        });
    } catch (err) {
        logger.warn(`Modlog yazılamadı (${guildId}): ${err.message}`);
    }
}
