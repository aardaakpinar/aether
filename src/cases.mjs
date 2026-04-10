import { db, nextCaseId } from "./db.mjs";

export function createCase(guildId, type, userId, reason, moderatorId) {
    const caseId = nextCaseId();

    if (!db.cases.has(guildId)) {
        db.cases.set(guildId, { nextCaseId: 1, cases: {} });
    }

    const guildCases = db.cases.get(guildId);
    guildCases.cases[caseId] = {
        id: caseId,
        type,
        userId,
        reason,
        moderatorId,
        date: new Date(),
    };

    return caseId;
}

export function getCase(guildId, caseId) {
    const guildCases = db.cases.get(guildId);
    return guildCases?.cases[caseId];
}
