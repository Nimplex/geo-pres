const timeMap = new Map<string, number>()

declare global {
    interface String {
        bold(): string;
        italic(): string;
        red(): string;
        green(): string;
        brightGreen(): string;
        yellow(): string;
        blue(): string;
        purple(): string;
        cyan(): string;
        grey(): string;
    }
}

export enum LogStyle {
    bold = 1,
    italic = 3,
    red = 31,
    green = 32,
    yellow = 33,
    blue = 34,
    purple = 35,
    cyan = 36,
    grey = 90
};

for (const [name, code] of Object.entries(LogStyle)) {
    Object.defineProperty(String.prototype, name, {
        value: function () {
            return `\x1b[${code}m${this}\x1b[0m`;
        },
        writable: true,
        configurable: true,
    });
}


export function log(style: LogStyle[], prefix: string, ...messages: any[]) {
    const chunks = messages.join("\t").split("\n");

    console.log(`[\x1b[${style.join(";")}m${prefix.padEnd(15, " ")}\x1b[m] ${chunks.shift()}`);

    for (const chunk of chunks)
        console.log(`\x1b[${LogStyle.grey}m${".".repeat(15)}->\x1b[m ${chunk}`);
}

export function timeStart(label: string) {
    timeMap.set(label, Date.now());
    log([LogStyle.grey, LogStyle.italic], "TIMER", `Start: "${label.cyan()}"`);
}

export function timeEnd(label: string) {
    const start = timeMap.get(label);

    if (start == undefined)
        throw new Error(`No timer found for label "${label}"`);

    log([LogStyle.grey, LogStyle.italic], "TIMER", `Job "${label.cyan()}" ended, duration: ${(Date.now() - start) / 1000}s`);
    timeMap.delete(label);
}