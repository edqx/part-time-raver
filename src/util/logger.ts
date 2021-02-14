import chalk from "chalk";
import util from "util";
import moment from "moment";

let _indent = 0;

function _log(prefix: string, template: string, ...fmt: any[]): void {
    const date = "[" + moment().format("YYYY/MM/DD HH:MM:SS") + "]";
    const formatted = util.format(template, ...fmt);
    // eslint-disable-next-line no-control-regex
    const clean = prefix.replace(/\x1b\[\d+m/g, "");

    process.stdout.write(chalk.grey(date) + " ".repeat(10 - clean.length) + prefix + " " + "  ".repeat(_indent) + formatted + "\n");
}

export function log(template: string, ...fmt: any[]): void {
    _log(chalk.grey("⬤ log"), template, ...fmt);
}

export function info(template: string, ...fmt: any[]): void {
    _log(chalk.blue("⬤ info"), template, ...fmt);
}

export function error(template: string, ...fmt: any[]): void {
    _log(chalk.red("✖ error"), template, ...fmt);
}

export function fatal(template: string, ...fmt: any[]): void {
    _log(chalk.red("✖ fatal"), template, ...fmt);
}

export function warn(template: string, ...fmt: any[]): void {
    _log(chalk.yellow("⚠ warn"), template, ...fmt);
}

export function success(template: string, ...fmt: any[]): void {
    _log(chalk.green("✓ success"), template, ...fmt);
}

export function indent(): void {
    _indent++;
}

export function unindent(): void {
    _indent--;
}

export default {
    log,
    info,
    error,
    fatal,
    warn,
    success,
    indent,
    unindent
};
