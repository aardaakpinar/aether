export const db = {
    warns: new Map(),
    bans: new Map(),
    mutes: new Map(),
    cases: new Map(),
    settings: new Map(),
    guildRoles: new Map(),
    spam: new Map(),
    reactionRoles: new Map(), // messageId -> {emoji: roleId, ...}
    roleMenus: new Map(), // guildId -> {menuId: {title, description, color, roles: [{role, emoji}], maxroles, exclusive, messageId}, ...}
    persistedRoles: new Map(), // userId -> [roleId, roleId, ...]
};

let caseCounter = 0;
export function nextCaseId() {
    return ++caseCounter;
}
