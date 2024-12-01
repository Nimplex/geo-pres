export function log(...message: any) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message.join("\t")}`);
}

export function error(...message: any) {
    console.error(`[${new Date().toLocaleTimeString()}] \x1b[31m${message.join("\t")}\x1b[m`)
}

export function ready(...message: any) {
    console.log(`[${new Date().toLocaleTimeString()}] \x1b[92m${message.join("\t")}\x1b[m`)
}

export function warn(...message: any) {
    console.warn(`[${new Date().toLocaleTimeString()}] \x1b[93m${message.join("\t")}\x1b[m`)
}