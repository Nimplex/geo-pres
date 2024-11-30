export function log(...message: any) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message.join("\t")}`);
}

export function error(...message: any) {
    console.log(`[${new Date().toLocaleTimeString()}] \x1b[31m[92m${message.join("\t")}\x1b[m`)
}

export function ready(...message: any) {
    console.log(`[${new Date().toLocaleTimeString()}] \x1b[92m${message.join("\t")}\x1b[m`)
}

export function warn(...message: any) {
    console.log(`[${new Date().toLocaleTimeString()}] \x1b[93m${message.join("\t")}\x1b[m`)
}