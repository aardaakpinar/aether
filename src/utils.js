export function parseTime(str) {
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const match = str?.match(/^(\d+)([smhd])$/);
    if (!match) return null;
    return parseInt(match[1], 10) * units[match[2]];
}

export function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

export function getUserId(text) {
    return text?.match(/<@!?(\d+)>/)?.[1] || text;
}

export function getMentionString(id) {
    return `<@${id}>`;
}
