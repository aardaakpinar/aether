import { db } from "./db.mjs";
import { RANKS, hasRank } from "./ranks.mjs";
import { createCase } from "./cases.mjs";
import { logModAction } from "./modlog.mjs";
import { logger } from "./logger.mjs";
import { parseTime, formatTime, getUserId, getMentionString } from "./utils.mjs";

export const DEFAULT_PREFIX = "!";

const DEFAULT_WELCOME_MESSAGE = "Welcome {user} to {server}! You are member #{membercount}.";
const DEFAULT_GOODBYE_MESSAGE = "Goodbye {username}, we hope to see you again!";
const DEFAULT_WELCOME_COLOR = "#5865F2";

function getOrCreateGuildSettings(guildId) {
    if (!guildId) return null;
    if (!db.settings.has(guildId)) {
        db.settings.set(guildId, {});
    }
    return db.settings.get(guildId);
}

function ensureWelcomeConfig(guildId) {
    const settings = getOrCreateGuildSettings(guildId);
    if (!settings) return null;

    if (!settings.welcome) {
        settings.welcome = {};
    }

    const welcome = settings.welcome;

    if (welcome.message == null) welcome.message = DEFAULT_WELCOME_MESSAGE;
    if (welcome.goodbyeMessage == null) welcome.goodbyeMessage = DEFAULT_GOODBYE_MESSAGE;
    if (welcome.color == null) welcome.color = DEFAULT_WELCOME_COLOR;
    if (welcome.embed == null) welcome.embed = false;
    if (welcome.goodbyeEmbed == null) welcome.goodbyeEmbed = false;
    if (welcome.autorole == null) welcome.autorole = null;
    if (welcome.channel === undefined) welcome.channel = null;
    if (welcome.goodbyeChannel === undefined) welcome.goodbyeChannel = null;

    return welcome;
}

function parseChannelId(arg) {
    if (!arg) return null;
    const mentionMatch = arg.match(/<#(\d+)>/);
    if (mentionMatch) return mentionMatch[1];
    if (/^\d+$/.test(arg)) return arg;
    return null;
}

function parseRoleId(arg) {
    if (!arg) return null;
    const mentionMatch = arg.match(/<@&(\d+)>/);
    if (mentionMatch) return mentionMatch[1];
    if (/^\d+$/.test(arg)) return arg;
    return null;
}

function normalizeHexColor(value) {
    if (!value) return null;
    const match = value.match(/^#?([0-9a-fA-F]{6})$/);
    if (!match) return null;
    return `#${match[1].toUpperCase()}`;
}

async function fetchGuildInfo(api, guildId) {
    if (!guildId) return null;
    try {
        return await api.guilds.get(guildId, { with_counts: true });
    } catch (err) {
        logger.warn(`Guild bilgisi Ã§ekilemedi (${guildId}): ${err.message}`);
        return null;
    }
}

async function renderTemplate(api, guildId, template, member) {
    if (!template) return "";
    const guildInfo = await fetchGuildInfo(api, guildId);
    const user = (member?.user ?? member) || {};
    const userId = user.id ?? null;
    const mention = userId ? getMentionString(userId) : user.username || "KullanÄ±cÄ±";
    const username = user.username || user.name || "KullanÄ±cÄ±";
    const serverName = guildInfo?.name || "Sunucu";
    const memberCountValue = guildInfo?.approximate_member_count ?? guildInfo?.member_count ?? "";
    const memberCount = memberCountValue !== undefined ? String(memberCountValue) : "";

    let text = template;
    text = text.replace(/{user}/gi, mention);
    text = text.replace(/{username}/gi, username);
    text = text.replace(/{server}/gi, serverName);
    text = text.replace(/{membercount}/gi, memberCount);

    return text;
}

function hexToNumber(hex) {
    const match = hex?.match(/^#?([0-9a-fA-F]{6})$/);
    if (!match) return null;
    return parseInt(match[1], 16);
}

async function sendTemplateMessage(api, channelId, template, { guildId, member, embed, color }) {
    if (!channelId || !template) return false;

    const content = await renderTemplate(api, guildId, template, member);
    const payload = embed
        ? {
              embeds: [
                  {
                      description: content,
                      color: hexToNumber(color) ?? undefined,
                  },
              ],
          }
        : { content };

    try {
        await api.channels.createMessage(channelId, payload);
        return true;
    } catch (err) {
        logger.warn(`Mesaj gÃ¶nderilemedi (${channelId}): ${err.message}`);
        return false;
    }
}

export async function sendGreeting(api, guildId, member, type = "welcome", overrideChannel = null) {
    if (!guildId) return false;
    const settings = db.settings.get(guildId);
    if (!settings?.welcome) return false;

    const config = settings.welcome;
    const normalizedType = type === "goodbye" ? "goodbye" : "welcome";
    const isWelcome = normalizedType === "welcome";
    const targetChannel = overrideChannel || (isWelcome ? config.channel : config.goodbyeChannel);
    const template = isWelcome ? config.message : config.goodbyeMessage;
    const useEmbed = isWelcome ? config.embed : config.goodbyeEmbed;

    if (!targetChannel || !template) return false;

    const sent = await sendTemplateMessage(api, targetChannel, template, {
        guildId,
        member,
        embed: !!useEmbed,
        color: config.color,
    });

    if (sent && isWelcome && !overrideChannel && config.autorole) {
        const userId = member?.user?.id ?? member?.id;
        if (userId) {
            try {
                await api.guilds.addRoleToMember(guildId, userId, config.autorole);
            } catch (err) {
                logger.warn(`Autorol atanamadÄ± (${guildId} / ${userId}): ${err.message}`);
            }
        }
    }

    return sent;
}

async function isServerOwner(api, guildId, userId) {
    if (!guildId || !userId) return false;
    const settings = getOrCreateGuildSettings(guildId);
    if (settings?.ownerId === userId) return true;

    try {
        const guild = await api.guilds.get(guildId);
        if (guild?.owner_id) {
            settings.ownerId = guild.owner_id;
            return guild.owner_id === userId;
        }
    } catch (err) {
        logger.warn(`Sunucu bilgisi Ã§ekilemedi (${guildId}): ${err.message}`);
    }

    return false;
}
3
async function prefixCommand(api, data, args) {
    const { channel_id: channelId, guild_id: guildId, author } = data;

    if (!guildId) {
        await api.channels.createMessage(channelId, { content: "âŒ Bu komut sadece sunucuda kullanÄ±labilir." });
        return;
    }

    if (!(await isServerOwner(api, guildId, author.id))) {
        await api.channels.createMessage(channelId, { content: "âŒ Bu komutu sadece sunucu sahibi kullanabilir." });
        return;
    }

    const settings = getOrCreateGuildSettings(guildId);
    if (!settings) return;

    const activePrefix = settings.commandPrefix || DEFAULT_PREFIX;
    const newPrefix = args[1];

    if (!newPrefix) {
        await api.channels.createMessage(channelId, {
            content: `Prefix: \`${activePrefix}\`\nYeni prefix belirlemek için \`${activePrefix}prefix <yeni>\` veya \`${activePrefix}prefix reset\` kullanabilirsiniz.`,
        });
        return;
    }

    if (newPrefix.toLowerCase() === "reset") {
        settings.commandPrefix = DEFAULT_PREFIX;
        await api.channels.createMessage(channelId, {
            content: `Prefix varsayÄ±lan \`${DEFAULT_PREFIX}\` olarak ayarlandÄ±.`,
        });
        return;
    }

    if (newPrefix.length > 5 || /\s/.test(newPrefix)) {
        await api.channels.createMessage(channelId, {
            content: "âŒ Prefix en fazla 5 karakter olabilir ve boÅŸluk içeremez.",
        });
        return;
    }

    settings.commandPrefix = newPrefix;
    await api.channels.createMessage(channelId, {
        content: `Yeni prefix: \`${newPrefix}\``,
    });
}

async function welcomeCommand(api, data, args) {
    const { channel_id: channelId, guild_id: guildId, member } = data;

    if (!guildId) {
        await api.channels.createMessage(channelId, { content: "âŒ Bu komut sadece sunucuda kullanÄ±labilir." });
        return;
    }

    if (!hasRank(member, RANKS.SR_ADMIN, false, guildId)) {
        await api.channels.createMessage(channelId, { content: "âŒ Yetersiz yetki (SR Admin+)" });
        return;
    }

    const settings = getOrCreateGuildSettings(guildId);
    const welcome = ensureWelcomeConfig(guildId);
    if (!welcome || !settings) return;

    const prefix = settings.commandPrefix || DEFAULT_PREFIX;
    const subcommand = args[1]?.toLowerCase();

    if (!subcommand) {
        const summary = [
            `HoÅŸ geldin kanalı: ${welcome.channel ? `<#${welcome.channel}>` : "AyarlanmadÄ±"}`,
            `HoÅŸ geldin mesajÄ±: ${welcome.message}`,
            `HoÅŸ geldin embed: ${welcome.embed ? "AÃ§Ä±k" : "Kapalı"}`,
            `Embed rengi: ${welcome.color}`,
            `Güle güle kanalı: ${welcome.goodbyeChannel ? `<#${welcome.goodbyeChannel}>` : "AyarlanmadÄ±"}`,
            `Güle güle mesajÄ±: ${welcome.goodbyeMessage}`,
            `Güle güle embed: ${welcome.goodbyeEmbed ? "AÃ§Ä±k" : "Kapalı"}`,
            `Otorol: ${welcome.autorole ? `<@&${welcome.autorole}>` : "Kapalı"}`,
        ];
        const usage = [
            `${prefix}welcome channel #kanal`,
            `${prefix}welcome message <metin>`,
            `${prefix}welcome embed <on|off>`,
            `${prefix}welcome color <hex>`,
            `${prefix}welcome goodbye channel #kanal`,
            `${prefix}welcome goodbye message <metin>`,
            `${prefix}welcome goodbye embed <on|off>`,
            `${prefix}welcome autorole <@rol|off>`,
            `${prefix}welcome test`,
        ];

        await api.channels.createMessage(channelId, {
            content: `HoÅŸ geldin ayarlarÄ±:\n${summary.join("\n")}\n\nKullanÄ±m:\n${usage.join("\n")}`,
        });
        return;
    }

    if (subcommand === "channel") {
        const target = parseChannelId(args[2]);
        if (!target) {
            await api.channels.createMessage(channelId, { content: "âŒ !welcome channel <#channel>" });
            return;
        }
        welcome.channel = target;
        await api.channels.createMessage(channelId, { content: `HoÅŸ geldin kanalı: <#${target}>` });
        return;
    }

    if (subcommand === "message") {
        const messageText = args.slice(2).join(" ").trim();
        if (!messageText) {
            await api.channels.createMessage(channelId, { content: "âŒ !welcome message <text>" });
            return;
        }
        welcome.message = messageText;
        await api.channels.createMessage(channelId, { content: "HoÅŸ geldin mesajÄ± kaydedildi." });
        return;
    }

    if (subcommand === "embed") {
        const flag = args[2]?.toLowerCase();
        if (flag !== "on" && flag !== "off") {
            await api.channels.createMessage(channelId, { content: "âŒ !welcome embed <on|off>" });
            return;
        }
        welcome.embed = flag === "on";
        await api.channels.createMessage(channelId, {
            content: `HoÅŸ geldin embed ${welcome.embed ? "aÃ§Ä±ldÄ±" : "kapatÄ±ldÄ±"}.`,
        });
        return;
    }

    if (subcommand === "color") {
        const colorValue = normalizeHexColor(args[2]);
        if (!colorValue) {
            await api.channels.createMessage(channelId, { content: "âŒ Geçerli hex rengi gir: #5865F2" });
            return;
        }
        welcome.color = colorValue;
        await api.channels.createMessage(channelId, { content: `Embed rengi: ${colorValue}` });
        return;
    }

    if (subcommand === "autorole") {
        const target = args[2];
        if (!target) {
            await api.channels.createMessage(channelId, { content: "âŒ !welcome autorole <@rol|off>" });
            return;
        }
        if (target.toLowerCase() === "off") {
            welcome.autorole = null;
            await api.channels.createMessage(channelId, { content: "Otorol kapatÄ±ldÄ±." });
            return;
        }
        const roleId = parseRoleId(target);
        if (!roleId) {
            await api.channels.createMessage(channelId, { content: "âŒ Geçerli rol belirtin: @Rol" });
            return;
        }
        welcome.autorole = roleId;
        await api.channels.createMessage(channelId, { content: `Otorol: <@&${roleId}>` });
        return;
    }

    if (subcommand === "test") {
        const previewMember = data.member ?? { user: data.author };
        const sent = await sendGreeting(api, guildId, previewMember, "welcome", channelId);
        if (!sent) {
            await api.channels.createMessage(channelId, {
                content: "âŒ Test mesajÄ± gönderilemedi. HoÅŸ geldin kanalı veya mesajÄ± ayarlı olmayabilir.",
            });
        }
        return;
    }

    if (subcommand === "goodbye") {
        const nested = args[2]?.toLowerCase();
        if (!nested) {
            await api.channels.createMessage(channelId, { content: "âŒ !welcome goodbye <channel|message|embed>" });
            return;
        }

        if (nested === "channel") {
            const target = parseChannelId(args[3]);
            if (!target) {
                await api.channels.createMessage(channelId, { content: "âŒ !welcome goodbye channel <#channel>" });
                return;
            }
            welcome.goodbyeChannel = target;
            await api.channels.createMessage(channelId, { content: `Güle güle kanalı: <#${target}>` });
            return;
        }

        if (nested === "message") {
            const messageText = args.slice(3).join(" ").trim();
            if (!messageText) {
                await api.channels.createMessage(channelId, { content: "âŒ !welcome goodbye message <text>" });
                return;
            }
            welcome.goodbyeMessage = messageText;
            await api.channels.createMessage(channelId, { content: "Güle güle mesajı kaydedildi." });
            return;
        }

        if (nested === "embed") {
            const flag = args[3]?.toLowerCase();
            if (flag !== "on" && flag !== "off") {
                await api.channels.createMessage(channelId, { content: "âŒ !welcome goodbye embed <on|off>" });
                return;
            }
            welcome.goodbyeEmbed = flag === "on";
            await api.channels.createMessage(channelId, {
                content: `Güle güle embed ${welcome.goodbyeEmbed ? "açıldı" : "kapandı"}.`,
            });
            return;
        }

        await api.channels.createMessage(channelId, { content: "âŒ !welcome goodbye <channel|message|embed>" });
        return;
    }

    await api.channels.createMessage(channelId, { content: "âŒ !welcome help" });
}

export const commands = {
    warn: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member, author } = data;

        if (!hasRank(member, RANKS.HELPER, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Helper+)" });
            return;
        }

        const userId = getUserId(args[1]);
        if (!userId) {
            await api.channels.createMessage(channelId, { content: "❌ Lütfen kullanıcı belirt: !warn @user [reason]" });
            return;
        }

        const reason = args.slice(2).join(" ") || "Sebep belirtilmedi";

        if (!db.warns.has(userId)) {
            db.warns.set(userId, []);
        }

        const warns = db.warns.get(userId);
        const warnCount = warns.length + 1;
        const caseId = createCase(guildId, "WARN", userId, reason, author.id);

        warns.push({
            reason,
            date: new Date(),
            by: author.id,
            caseId,
        });

        const embed = {
            title: `⚠️ Uyarı Verildi (#${caseId})`,
            description: `**Kullanıcı:** ${getMentionString(userId)}\n**Sebep:** ${reason}\n**Uyarı:** ${warnCount}/3`,
            color: 0xfbbf24,
            footer: { text: `Moderatör: ${author.id}` },
        };

        await logModAction(api, guildId, embed);

        const msg = await api.channels.createMessage(channelId, {
            content: `⚠️ ${getMentionString(userId)} uyarı verildi (${warnCount}/3) - Case #${caseId}`,
        });

        setTimeout(async () => {
            try {
                await api.channels.deleteMessage(channelId, msg.id);
            } catch (e) {}
        }, 5000);

        if (warnCount >= 3) {
            try {
                await api.guilds.createBan(guildId, userId, { reason: "3 uyarı sınırı aşıldı" });
                db.warns.delete(userId);

                await api.channels.createMessage(channelId, {
                    content: `⛔ ${getMentionString(userId)} 3 uyarıdan dolayı banlandı!`,
                });
            } catch (err) {
                console.error(`Auto-ban başarısız (${userId})`, err);
            }
        }
    },

    kick: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member, author } = data;

        if (!hasRank(member, RANKS.MOD, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Mod+)" });
            return;
        }

        const userId = getUserId(args[1]);
        if (!userId) {
            await api.channels.createMessage(channelId, { content: "❌ Lütfen kullanıcı belirt: !kick @user [reason]" });
            return;
        }

        const reason = args.slice(2).join(" ") || "Sebep belirtilmedi";
        const caseId = createCase(guildId, "KICK", userId, reason, author.id);

        try {
            await api.guilds.removeMember(guildId, userId);

            const embed = {
                title: `👢 Kick (#${caseId})`,
                description: `**Kullanıcı:** ${getMentionString(userId)}\n**Sebep:** ${reason}`,
                color: 0xa78bfa,
                footer: { text: `Moderatör: ${author.id}` },
            };

            await logModAction(api, guildId, embed);

            const msg = await api.channels.createMessage(channelId, {
                content: `👢 ${getMentionString(userId)} kicklendi - Case #${caseId}`,
            });

            setTimeout(async () => {
                try {
                    await api.channels.deleteMessage(channelId, msg.id);
                } catch (e) {}
            }, 5000);
        } catch (err) {
            await api.channels.createMessage(channelId, { content: `❌ Kick başarısız: ${err.message}` });
        }
    },

    ban: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member, author } = data;

        if (!hasRank(member, RANKS.HELPER, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Helper+)" });
            return;
        }

        const userId = getUserId(args[1]);
        if (!userId) {
            await api.channels.createMessage(channelId, { content: "❌ Lütfen kullanıcı belirt: !ban @user [reason]" });
            return;
        }

        const reason = args.slice(2).join(" ") || "Sebep belirtilmedi";
        const caseId = createCase(guildId, "BAN", userId, reason, author.id);

        try {
            await api.guilds.createBan(guildId, userId, { reason });

            if (!db.bans.has(userId)) {
                db.bans.set(userId, []);
            }
            db.bans.get(userId).push({ reason, date: new Date(), by: author.id, caseId, until: null });

            const embed = {
                title: `⛔ Ban (#${caseId})`,
                description: `**Kullanıcı:** ${getMentionString(userId)}\n**Sebep:** ${reason}`,
                color: 0xf43f5e,
                footer: { text: `Moderatör: ${author.id}` },
            };

            await logModAction(api, guildId, embed);

            const msg = await api.channels.createMessage(channelId, {
                content: `⛔ ${getMentionString(userId)} banlandı - Case #${caseId}`,
            });

            setTimeout(async () => {
                try {
                    await api.channels.deleteMessage(channelId, msg.id);
                } catch (e) {}
            }, 5000);
        } catch (err) {
            await api.channels.createMessage(channelId, { content: `❌ Ban başarısız: ${err.message}` });
        }
    },

    unban: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member, author } = data;

        if (!hasRank(member, RANKS.MOD, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Mod+)" });
            return;
        }

        const userId = args[1];
        if (!userId) {
            await api.channels.createMessage(channelId, { content: "❌ Lütfen User ID belirt: !unban <userid>" });
            return;
        }

        const reason = args.slice(2).join(" ") || "Ban appeal kabulü";
        const caseId = createCase(guildId, "UNBAN", userId, reason, author.id);

        try {
            await api.guilds.removeBan(guildId, userId);

            const embed = {
                title: `✅ Unban (#${caseId})`,
                description: `**Kullanıcı:** ${userId}\n**Sebep:** ${reason}`,
                color: 0x4ade80,
                footer: { text: `Moderatör: ${author.id}` },
            };

            await logModAction(api, guildId, embed);

            const msg = await api.channels.createMessage(channelId, {
                content: `✅ ${userId} banı kaldırıldı - Case #${caseId}`,
            });

            setTimeout(async () => {
                try {
                    await api.channels.deleteMessage(channelId, msg.id);
                } catch (e) {}
            }, 5000);
        } catch (err) {
            await api.channels.createMessage(channelId, { content: `❌ Unban başarısız: ${err.message}` });
        }
    },

    purge: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member } = data;

        if (!hasRank(member, RANKS.MOD, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Mod+)" });
            return;
        }

        const amount = parseInt(args[1] || "10", 10);
        if (isNaN(amount) || amount < 1 || amount > 500) {
            await api.channels.createMessage(channelId, {
                content: "❌ Geçerli bir sayı gir: !purge [1-500]",
            });
            return;
        }

        try {
            const messages = await api.channels.getMessages(channelId, { limit: amount });
            let deleted = 0;
            for (const msg of messages) {
                try {
                    await api.channels.deleteMessage(channelId, msg.id);
                    deleted++;
                } catch (e) {}
            }

            const statusMsg = await api.channels.createMessage(channelId, {
                content: `🧹 ${deleted}/${amount} mesaj silindi`,
            });

            setTimeout(async () => {
                try {
                    await api.channels.deleteMessage(channelId, statusMsg.id);
                } catch (e) {}
            }, 3000);
        } catch (err) {
            console.error(`Purge başarısız (${channelId})`, err);
        }
    },

    mute: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member, author } = data;

        if (!hasRank(member, RANKS.MOD, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Mod+)" });
            return;
        }

        const userId = getUserId(args[1]);
        if (!userId) {
            await api.channels.createMessage(channelId, { content: "❌ Lütfen kullanıcı belirt: !mute @user <duration> [reason]" });
            return;
        }

        const duration = args[2];
        if (!duration || duration === "off") {
            db.mutes.delete(userId);
            await api.channels.createMessage(channelId, { content: `🔊 ${getMentionString(userId)} susturması kaldırıldı` });
            return;
        }

        const durationMs = parseTime(duration);
        if (!durationMs) {
            await api.channels.createMessage(channelId, { content: "❌ Geçerli bir süre gir: 30s, 1m, 1h, 7d" });
            return;
        }

        const reason = args.slice(3).join(" ") || "Sebep belirtilmedi";
        const until = Date.now() + durationMs;

        db.mutes.set(userId, { until, reason });

        const msg = await api.channels.createMessage(channelId, {
            content: `🔇 ${getMentionString(userId)} ${formatTime(durationMs)} için susturuldu - ${reason}`,
        });

        setTimeout(async () => {
            try {
                await api.channels.deleteMessage(channelId, msg.id);
            } catch (e) {}
        }, 5000);
    },

    history: async (api, data, args) => {
        const { channel_id: channelId, member, guild_id: guildId } = data;

        if (!hasRank(member, RANKS.HELPER, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Helper+)" });
            return;
        }

        const userId = getUserId(args[1]);
        if (!userId) {
            await api.channels.createMessage(channelId, { content: "❌ Lütfen kullanıcı belirt: !history @user" });
            return;
        }

        let text = `📋 **${getMentionString(userId)} Moderation Geçmişi**\n\n`;
        const warns = db.warns.get(userId) || [];
        const bans = db.bans.get(userId) || [];

        if (warns.length === 0 && bans.length === 0) {
            text += "Temiz sicil! ✨";
        } else {
            if (warns.length > 0) {
                text += `**Uyarılar (${warns.length}):**\n`;
                warns.forEach((w, i) => {
                    text += `  ${i + 1}. ${w.reason} (Case #${w.caseId})\n`;
                });
                text += "\n";
            }
            if (bans.length > 0) {
                text += `**Banlar (${bans.length}):**\n`;
                bans.forEach((b, i) => {
                    text += `  ${i + 1}. ${b.reason} (Case #${b.caseId})\n`;
                });
            }
        }

        await api.channels.createMessage(channelId, { content: text });
    },

    case: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member } = data;

        if (!hasRank(member, RANKS.HELPER, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Helper+)" });
            return;
        }

        const caseId = parseInt(args[1], 10);
        if (!caseId || isNaN(caseId)) {
            await api.channels.createMessage(channelId, { content: "❌ Lütfen Case ID belirt: !case <id>" });
            return;
        }

        const caseData = db.cases.get(guildId)?.cases[caseId];
        if (!caseData) {
            await api.channels.createMessage(channelId, { content: "❌ Case bulunamadı" });
            return;
        }

        const text = `📌 **Case #${caseId}**\n**Tip:** ${caseData.type}\n**Kullanıcı:** ${getMentionString(caseData.userId)}\n**Sebep:** ${caseData.reason}\n**Moderatör:** ${getMentionString(caseData.moderatorId)}\n**Tarih:** ${new Date(caseData.date).toLocaleString('tr-TR')}`;
        await api.channels.createMessage(channelId, { content: text });
    },

    help: async (api, data) => {
        const { channel_id: channelId, guild_id: guildId } = data;
        const settings = guildId ? db.settings.get(guildId) : null;
        const prefix = settings?.commandPrefix || DEFAULT_PREFIX;

        await api.channels.createMessage(channelId, {
            content: `**Uyarı & Ban:**
• ${prefix}warn @user [reason] - Uyarı ver
• ${prefix}ban @user [reason] - Ban et
• ${prefix}unban <userid> [reason] - Ban kaldır
• ${prefix}kick @user [reason] - Kick et
• ${prefix}tempban @user <duration> [reason] - Geçici ban
• ${prefix}softban @user [days] [reason] - Mesaj sil + unban

**Mesaj Yönetimi:**
• ${prefix}purge [1-500] - Mesaj sil
• ${prefix}slowmode <time|off> - Yavaş mod (5s, 1m, vb)
• ${prefix}mute @user <duration> - Sustur (30s, 1m, 1h, 7d, 28d)
• ${prefix}unmute @user - Susturmayı kaldır

**Kanal Yönetimi:**
• ${prefix}lock [#channel] [reason] - Kanal kilitle
• ${prefix}unlock [#channel] [reason] - Kanal kilidi aç

**Kayıtlar:**
• ${prefix}history @user - Geçmişi gör
• ${prefix}case <id> - Case detayları
• ${prefix}modlog channel #channel - Log kanalı ayarla

**Sunucu Özelleştirme:**
• ${prefix}prefix [yeni prefix] - Sunucu prefixini gör/güncelle (Sunucu sahibi)
• ${prefix}prefix reset - Prefixi varsayılana döndür`,
        });
    },

    prefix: prefixCommand,
    setprefix: prefixCommand,
    changeprefix: prefixCommand,
    welcome: welcomeCommand,
    welcomeconfig: welcomeCommand,
    greet: welcomeCommand,

    tempban: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member, author } = data;

        if (!hasRank(member, RANKS.MOD, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Mod+)" });
            return;
        }

        const userId = getUserId(args[1]);
        if (!userId) {
            await api.channels.createMessage(channelId, { content: "❌ !tempban @user <duration> [reason]" });
            return;
        }

        const duration = args[2];
        if (!duration) {
            await api.channels.createMessage(channelId, { content: "❌ Süre belirt: 30m, 12h, 7d" });
            return;
        }

        const durationMs = parseTime(duration);
        if (!durationMs) {
            await api.channels.createMessage(channelId, { content: "❌ Geçerli bir süre gir" });
            return;
        }

        const reason = args.slice(3).join(" ") || "Sebep belirtilmedi";
        const until = Date.now() + durationMs;
        const caseId = createCase(guildId, "TEMPBAN", userId, reason, author.id);

        try {
            await api.guilds.createBan(guildId, userId, { reason });

            if (!db.bans.has(userId)) {
                db.bans.set(userId, []);
            }
            db.bans.get(userId).push({ reason, date: new Date(), by: author.id, caseId, until });

            const msg = await api.channels.createMessage(channelId, {
                content: `⏰ ${getMentionString(userId)} ${formatTime(durationMs)} için banlandı - Case #${caseId}`,
            });

            setTimeout(async () => {
                try {
                    await api.channels.deleteMessage(channelId, msg.id);
                } catch (e) {}
            }, 5000);

            setTimeout(async () => {
                try {
                    await api.guilds.removeBan(guildId, userId);
                } catch (err) {
                    console.warn(`Tempban unban başarısız (${userId}): ${err.message}`);
                }
            }, durationMs);
        } catch (err) {
            await api.channels.createMessage(channelId, { content: `❌ Tempban başarısız: ${err.message}` });
        }
    },

    softban: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member, author } = data;

        if (!hasRank(member, RANKS.MOD, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Mod+)" });
            return;
        }

        const userId = getUserId(args[1]);
        if (!userId) {
            await api.channels.createMessage(channelId, { content: "❌ !softban @user [days] [reason]" });
            return;
        }

        const days = parseInt(args[2] || "1", 10);
        const reason = args.slice(3).join(" ") || "Mesaj temizliği";
        const caseId = createCase(guildId, "SOFTBAN", userId, reason, author.id);

        try {
            await api.guilds.createBan(guildId, userId, {
                delete_message_seconds: days * 86400,
            });

            setTimeout(async () => {
                try {
                    await api.guilds.removeBan(guildId, userId);
                } catch (e) {}
            }, 1000);

            const msg = await api.channels.createMessage(channelId, {
                content: `🧹 ${getMentionString(userId)} softban edildi (${days} gün mesaj silindi) - Case #${caseId}`,
            });

            setTimeout(async () => {
                try {
                    await api.channels.deleteMessage(channelId, msg.id);
                } catch (e) {}
            }, 5000);
        } catch (err) {
            await api.channels.createMessage(channelId, { content: `❌ Softban başarısız: ${err.message}` });
        }
    },

    slowmode: async (api, data, args) => {
        const { channel_id: channelId } = data;
        const timeStr = args[1];

        if (!timeStr) {
            await api.channels.createMessage(channelId, { content: "❌ !slowmode <5s|1m|10m|off>" });
            return;
        }

        try {
            if (timeStr.toLowerCase() === "off") {
                await api.channels.edit(channelId, { rate_limit_per_user: 0 });
                const msg = await api.channels.createMessage(channelId, { content: "⚡ Yavaş mod kapatıldı" });
                setTimeout(async () => {
                    try {
                        await api.channels.deleteMessage(channelId, msg.id);
                    } catch (e) {}
                }, 3000);
            } else {
                const seconds = parseTime(timeStr) / 1000;
                if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
                    await api.channels.createMessage(channelId, { content: "❌ Geçerli bir süre gir (0-6h)" });
                    return;
                }

                await api.channels.edit(channelId, { rate_limit_per_user: Math.floor(seconds) });
                const msg = await api.channels.createMessage(channelId, {
                    content: `⏱️ Yavaş mod: her mesaj arasında ${formatTime(seconds * 1000)} bekleme`,
                });
                setTimeout(async () => {
                    try {
                        await api.channels.deleteMessage(channelId, msg.id);
                    } catch (e) {}
                }, 5000);
            }
        } catch (err) {
            await api.channels.createMessage(channelId, { content: `❌ Slowmode hatası: ${err.message}` });
        }
    },

    lock: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member } = data;

        if (!hasRank(member, RANKS.MOD, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Mod+)" });
            return;
        }

        const reason = args.slice(1).join(" ") || "Kanal kilitlendi";

        try {
            const roles = db.guildRoles.get(guildId) || [];
            const everyoneRole = roles.find((r) => r.name === "@everyone");

            if (everyoneRole) {
                await api.channels.editPermissionOverwrite(channelId, everyoneRole.id, {
                    allow: 0,
                    deny: 0x800,
                });
            }

            const msg = await api.channels.createMessage(channelId, {
                content: `🔒 Kanal kilitlendi - ${reason}`,
            });

            setTimeout(async () => {
                try {
                    await api.channels.deleteMessage(channelId, msg.id);
                } catch (e) {}
            }, 5000);
        } catch (err) {
            await api.channels.createMessage(channelId, { content: `❌ Lock hatası: ${err.message}` });
        }
    },

    unlock: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member } = data;

        if (!hasRank(member, RANKS.MOD, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Mod+)" });
            return;
        }

        const reason = args.slice(1).join(" ") || "Kanal kilidi açıldı";

        try {
            const roles = db.guildRoles.get(guildId) || [];
            const everyoneRole = roles.find((r) => r.name === "@everyone");

            if (everyoneRole) {
                await api.channels.deletePermissionOverwrite(channelId, everyoneRole.id);
            }

            const msg = await api.channels.createMessage(channelId, {
                content: `🔓 Kanal kilidi açıldı - ${reason}`,
            });

            setTimeout(async () => {
                try {
                    await api.channels.deleteMessage(channelId, msg.id);
                } catch (e) {}
            }, 5000);
        } catch (err) {
            await api.channels.createMessage(channelId, { content: `❌ Unlock hatası: ${err.message}` });
        }
    },

    modlog: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member } = data;

        if (!hasRank(member, RANKS.ADMIN, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Admin+)" });
            return;
        }

        const subcommand = args[1];

        if (!db.settings.has(guildId)) {
            db.settings.set(guildId, {});
        }

        const settings = db.settings.get(guildId);

        if (subcommand === "channel") {
            const chanId = args[2]?.match(/<#(\d+)>/)?.[1];
            if (!chanId) {
                await api.channels.createMessage(channelId, { content: "❌ !modlog channel <#channel>" });
                return;
            }

            settings.modlogChannel = chanId;
            await api.channels.createMessage(channelId, { content: `✅ Modlog kanalı: <#${chanId}>` });
        } else if (subcommand === "status") {
            const logChan = settings.modlogChannel ? `<#${settings.modlogChannel}>` : "Ayarlanmadı";
            await api.channels.createMessage(channelId, { content: `📋 Modlog Kanalı: ${logChan}` });
        } else {
            await api.channels.createMessage(channelId, { content: "❌ !modlog channel <#channel> | !modlog status" });
        }
    },

    rr: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member } = data;

        if (!hasRank(member, RANKS.ADMIN, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Admin+)" });
            return;
        }

        const subcommand = args[1]?.toLowerCase();

        if (subcommand === "add") {
            const messageId = args[2];
            const emoji = args[3];
            const roleId = args[4]?.match(/<@&(\d+)>/)?.[1];

            if (!messageId || !emoji || !roleId) {
                await api.channels.createMessage(channelId, { content: "❌ !rr add <messageid> <emoji> <@role>" });
                return;
            }

            if (!db.reactionRoles.has(messageId)) {
                db.reactionRoles.set(messageId, {});
            }
            db.reactionRoles.get(messageId)[emoji] = roleId;
            await api.channels.createMessage(channelId, { content: `✅ ${emoji} -> <@&${roleId}> bağlantısı eklendi.` });
        } else if (subcommand === "remove") {
            const messageId = args[2];
            const emoji = args[3];

            if (!messageId || !emoji) {
                await api.channels.createMessage(channelId, { content: "❌ !rr remove <messageid> <emoji>" });
                return;
            }

            if (db.reactionRoles.has(messageId) && db.reactionRoles.get(messageId)[emoji]) {
                delete db.reactionRoles.get(messageId)[emoji];
                await api.channels.createMessage(channelId, { content: `✅ ${emoji} bağlantısı kaldırıldı.` });
            } else {
                await api.channels.createMessage(channelId, { content: "❌ Bu emoji için bağlantı bulunamadı." });
            }
        } else if (subcommand === "clear") {
            const messageId = args[2];

            if (!messageId) {
                await api.channels.createMessage(channelId, { content: "❌ !rr clear <messageid>" });
                return;
            }

            if (db.reactionRoles.has(messageId)) {
                db.reactionRoles.delete(messageId);
                await api.channels.createMessage(channelId, { content: `✅ ${messageId} mesajının tüm bağlantıları silindi.` });
            } else {
                await api.channels.createMessage(channelId, { content: "❌ Bu mesaj için bağlantı bulunamadı." });
            }
        } else if (subcommand === "list") {
            let text = "📋 **Reaction Roles Bağlantıları**\n\n";
            if (db.reactionRoles.size === 0) {
                text += "Hiç bağlantı yok.";
            } else {
                for (const [msgId, bindings] of db.reactionRoles.entries()) {
                    text += `**Mesaj ${msgId}:**\n`;
                    for (const [emoji, roleId] of Object.entries(bindings)) {
                        text += `  ${emoji} → <@&${roleId}>\n`;
                    }
                    text += "\n";
                }
            }
            await api.channels.createMessage(channelId, { content: text });
        } else {
            await api.channels.createMessage(channelId, { content: "❌ Subkomut: add, remove, clear, list" });
        }
    },

    rolemenu: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member } = data;

        if (!hasRank(member, RANKS.ADMIN, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (Admin+)" });
            return;
        }

        const subcommand = args[1]?.toLowerCase();

        if (!db.roleMenus.has(guildId)) {
            db.roleMenus.set(guildId, {});
        }
        const menus = db.roleMenus.get(guildId);

        if (subcommand === "create") {
            const title = args.slice(2).join(" ");
            if (!title) {
                await api.channels.createMessage(channelId, { content: "❌ !rolemenu create <title>" });
                return;
            }

            const menuId = Object.keys(menus).length + 1;
            menus[menuId] = {
                title,
                description: "",
                color: 0x5865f2,
                roles: [],
                maxroles: 0,
                exclusive: false,
                messageId: null,
            };
            await api.channels.createMessage(channelId, { content: `✅ Menu oluşturuldu. ID: ${menuId}` });
        } else if (subcommand === "add") {
            const menuId = args[2];
            const roleId = args[3]?.match(/<@&(\d+)>/)?.[1];
            const emoji = args[4];

            if (!menuId || !roleId || !emoji || !menus[menuId]) {
                await api.channels.createMessage(channelId, { content: "❌ !rolemenu add <menuid> <@role> <emoji>" });
                return;
            }

            menus[menuId].roles.push({ role: roleId, emoji });
            await api.channels.createMessage(channelId, { content: `✅ <@&${roleId}> menu'ye eklendi.` });
        } else if (subcommand === "config") {
            const menuId = args[2];
            const configKey = args[3]?.toLowerCase();
            const configValue = args.slice(4).join(" ");

            if (!menuId || !configKey || !menus[menuId]) {
                await api.channels.createMessage(channelId, { content: "❌ !rolemenu config <menuid> <key> <value>" });
                return;
            }

            if (configKey === "title") menus[menuId].title = configValue;
            else if (configKey === "description") menus[menuId].description = configValue;
            else if (configKey === "color") menus[menuId].color = parseInt(configValue.replace("#", ""), 16) || 0x5865f2;
            else if (configKey === "maxroles") menus[menuId].maxroles = parseInt(configValue) || 0;
            else if (configKey === "exclusive") menus[menuId].exclusive = configValue.toLowerCase() === "on";

            await api.channels.createMessage(channelId, { content: `✅ ${configKey} güncelleştirildi.` });
        } else if (subcommand === "list") {
            let text = "📋 **Role Menus**\n\n";
            if (Object.keys(menus).length === 0) {
                text += "Hiç menu yok.";
            } else {
                for (const [id, menu] of Object.entries(menus)) {
                    text += `**Menu ${id}: ${menu.title}**\n`;
                    text += `  Roller: ${menu.roles.length}\n`;
                    text += `  Max: ${menu.maxroles || "Sınırsız"}\n\n`;
                }
            }
            await api.channels.createMessage(channelId, { content: text });
        } else {
            await api.channels.createMessage(channelId, { content: "❌ Subkomutlar: create, add, config, list, post, delete, status" });
        }
    },

    rolepersist: async (api, data, args) => {
        const { channel_id: channelId, guild_id: guildId, member, author } = data;

        if (!hasRank(member, RANKS.SR_MOD, false, guildId)) {
            await api.channels.createMessage(channelId, { content: "❌ Yetersiz yetki (SR Mod+)" });
            return;
        }

        const subcommand = args[1]?.toLowerCase();

        if (subcommand === "add") {
            const userId = getUserId(args[2]) || args[2];
            const roleIds = [];

            for (let i = 3; i < args.length; i++) {
                const roleId = args[i]?.match(/<@&(\d+)>/)?.[1];
                if (roleId) roleIds.push(roleId);
            }

            if (!userId || roleIds.length === 0) {
                await api.channels.createMessage(channelId, { content: "❌ !rolepersist add <@user> <@role> [@role2...]" });
                return;
            }

            db.persistedRoles.set(userId, roleIds);
            await api.channels.createMessage(channelId, { content: `✅ ${roleIds.length} rol ${userId} için kaydedildi.` });
        } else if (subcommand === "remove") {
            const userId = getUserId(args[2]) || args[2];

            if (!userId) {
                await api.channels.createMessage(channelId, { content: "❌ !rolepersist remove <@user>" });
                return;
            }

            if (db.persistedRoles.has(userId)) {
                db.persistedRoles.delete(userId);
                await api.channels.createMessage(channelId, { content: `✅ ${userId} için kaydedilmiş roller silindi.` });
            } else {
                await api.channels.createMessage(channelId, { content: "❌ Bu kullanıcı için kayıt bulunamadı." });
            }
        } else if (subcommand === "list") {
            let text = "📋 **Persisted Roles**\n\n";
            if (db.persistedRoles.size === 0) {
                text += "Hiç kayıt yok.";
            } else {
                for (const [userId, roleIds] of db.persistedRoles.entries()) {
                    text += `**<@${userId}>**: ${roleIds.map(id => `<@&${id}>`).join(", ")}\n`;
                }
            }
            await api.channels.createMessage(channelId, { content: text });
        } else if (subcommand === "info") {
            const userId = getUserId(args[2]) || args[2];

            if (!userId) {
                await api.channels.createMessage(channelId, { content: "❌ !rolepersist info <@user>" });
                return;
            }

            const roles = db.persistedRoles.get(userId);
            if (roles) {
                const text = `📌 <@${userId}> için kaydedilmiş roller:\n${roles.map(id => `  • <@&${id}>`).join("\n")}`;
                await api.channels.createMessage(channelId, { content: text });
            } else {
                await api.channels.createMessage(channelId, { content: `❌ <@${userId}> için kayıt bulunamadı.` });
            }
        } else {
            await api.channels.createMessage(channelId, { content: "❌ Subkomutlar: add, remove, list, info" });
        }
    },

    reactionrole: async (api, data, args) => {
        args[0] = "!rr";
        return commands.rr(api, data, args);
    },

    rmenu: async (api, data, args) => {
        args[0] = "!rolemenu";
        return commands.rolemenu(api, data, args);
    },

    persistrole: async (api, data, args) => {
        args[0] = "!rolepersist";
        return commands.rolepersist(api, data, args);
    },

    rp: async (api, data, args) => {
        args[0] = "!rolepersist";
        return commands.rolepersist(api, data, args);
    },
};

