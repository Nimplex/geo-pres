import { access, constants, mkdir } from "node:fs/promises";
import { exit } from "node:process";
import { log, LogStyle } from "./logger";

export async function ensureExists(path: string) {
    try {
        await access(path, constants.F_OK);
    } catch {
        log([LogStyle.yellow], "WARN", "Missing \"data\" directory, creating one");
        
        try {
            await mkdir(path);
        } catch (err) {
            log([LogStyle.red, LogStyle.bold], "ERROR", "Failed to create data directory", err);
            exit(1)
        }
    }
}