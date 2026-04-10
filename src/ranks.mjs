import { db } from "./db.mjs";

export const RANKS = {
    EVERYONE: 0,
    HELPER: 1,
    MOD: 2,
    SR_MOD: 3,
    ADMIN: 4,
    SR_ADMIN: 5,
    OWNER: 6,
};

export function getUserRank(member, isOwner = false, guildId = null) {
    if (isOwner) return RANKS.OWNER;
    if (!member) return RANKS.EVERYONE;

    const permsStr = member.permissions;
    if (permsStr) {
        const perms = parseInt(permsStr, 10);
        if ((perms & 0x8) === 0x8) return RANKS.SR_ADMIN;
        if ((perms & 0x10000000000) === 0x10000000000) return RANKS.MOD;
    }

    if (guildId && member.roles && Array.isArray(member.roles) && db.guildRoles.has(guildId)) {
        const guildRoles = db.guildRoles.get(guildId);
        let totalPerms = 0n;

        for (const roleId of member.roles) {
            const role = guildRoles.find((r) => r.id === roleId);
            if (role && role.permissions) {
                const rolePerms = BigInt(role.permissions);
                totalPerms |= rolePerms;
            }
        }

        if ((totalPerms & 0x8n) === 0x8n) return RANKS.SR_ADMIN;
        if ((totalPerms & 0x10000000000n) === 0x10000000000n) return RANKS.MOD;
    }

    return RANKS.EVERYONE;
}

export function hasRank(member, minRank, isOwner = false, guildId = null) {
    return getUserRank(member, isOwner, guildId) >= minRank;
}
