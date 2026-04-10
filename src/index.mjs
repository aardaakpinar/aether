import "dotenv/config";
import { Client } from "@discordjs/core";
import { REST } from "@discordjs/rest";
import { WebSocketManager } from "@discordjs/ws";
import { logger } from "./logger.mjs";
import { registerEvents } from "./events.mjs";

const token = process.env.FLUXER_BOT_TOKEN;
if (!token) throw new Error("Token yok!");

const rest = new REST({
    api: "https://api.fluxer.app",
    version: "1",
}).setToken(token);

const gateway = new WebSocketManager({
    intents: 515,
    rest,
    token,
    version: "1",
});

const client = new Client({ rest, gateway });
registerEvents(client);

process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", reason);
});

process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", err);
});

try {
    gateway.connect();
    logger.info("Bot bağlanıyor...");
} catch (err) {
    logger.error("Bot connection error", err);
    process.exit(1);
}
