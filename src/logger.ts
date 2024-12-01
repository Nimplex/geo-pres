export function log(style: LogStyle[], prefix: string, ...message: any) {
    console.log(`[\x1b[${style.join(";")}m${prefix.padEnd(15, " ")}\x1b[m] ${message.join("")}`);
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
}
