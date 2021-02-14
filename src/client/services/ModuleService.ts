import discord from "discord.js";
import numeral from "numeral";

import util from "util";
import path from "path";
import fs from "fs/promises";
import EventEmitter from "events";

import logger from "../../util/logger";

export class ArgError {
    message: string;
    type?: ArgumentType;
    arg?: Argument;
    version?: CommandVersion;

    constructor(message: string, ...fmt: string[]) {
        this.message = util.format(message, ...fmt);
    }

    [util.inspect.custom](): string {
        return "ArgError: " + this.message;
    }

    toString(): string {
        return "ArgError: " + this.message;
    }

    toJSON(): any {
        return this.toString();
    }

    [Symbol.toStringTag](): string {
        return "[ArgError]";
    }
}

export class CommandInterface {
    constructor(private _command: Command, private _version: CommandVersion, private _args: ParsedArgs, private _message: discord.Message) {

    }

    get args(): ParsedArgs {
        return this._args;
    }

    get message(): discord.Message {
        return this._message;
    }

    async reply(content: string): Promise<discord.Message> {
        return await this.message.reply(content);
    }
}

export interface ModuleInfo {
    name: string;
    summary: string;
    emoji: string;
    admin?: boolean;
    beta?: boolean;
    hidden?: boolean;
    commands: Command[];
}

export class Module implements ModuleInfo {
    name: string;
    summary: string;
    emoji: string;
    admin: boolean;
    beta: boolean;
    hidden: boolean;
    commands: Command[];

    loaded: Map<string, Command>;
    dirname: string;
    filename: string;

    constructor(info: ModuleInfo) {
        this.name = info.name;
        this.summary = info.summary;
        this.emoji = info.emoji;
        this.admin = info.admin ?? false;
        this.beta = info.beta ?? false;
        this.hidden = info.hidden ?? false;
        this.commands = info.commands;

        this.loaded = new Map;
    }

    async load(filename: string): Promise<Command> {
        const pathname = path.resolve(__dirname, this.dirname, "commands", filename);

        try {
            delete require.cache[pathname];
            const { default: loadedcmd } = await import(pathname) as { default: { new(): Command } };

            const command = new loadedcmd();
            command.filename = filename;

            if (this.loaded.get(command.name))
                return null;

            this.loaded.set(command.name, command);

            return command;
        } catch (e) {
            logger.error(e);

            if (~e.toString().indexOf("Cannot find module '" + pathname))
                return null;

            throw e;
        }
    }

    unload(command: string): Command {
        const loaded = this.loaded.get(command);

        if (loaded) {
            this.loaded.delete(command);

            return loaded;
        }

        return null;
    }

    async reload(command: string): Promise<Command> {
        const unloaded = this.unload(command);
        if (unloaded) {
            return this.load(unloaded.filename);
        }

        return null;
    }

    async loadAll(): Promise<Map<string, Command>> {
        const all_loaded: Map<string, Command> = new Map;
        const command_files = await fs.readdir(path.resolve(this.dirname, "commands"));

        for (let i = 0; i < command_files.length; i++) {
            const file = command_files[i];

            const loaded = await this.load(file);

            if (loaded)
                all_loaded.set(loaded.name, loaded);
        }

        return all_loaded;
    }

    unloadAll(): void {
        for (const [ command ] of this.loaded) {
            this.unload(command);
        }
    }

    async reloadAll(): Promise<void> {
        for (const [ command ] of this.loaded) {
            await this.reload(command);
        }
    }
}

export interface CommandInfo {
    name: string;
    summary: string;
    emoji: string;
    admin?: boolean;
    beta?: boolean;
    hidden?: boolean;
    versions: CommandVersion[];
}

export class Command implements CommandInfo {
    name: string;
    summary: string;
    emoji: string;
    admin: boolean;
    beta: boolean;
    hidden: boolean;
    versions: CommandVersion[];

    filename?: string;

    constructor(info: CommandInfo) {
        this.name = info.name;
        this.summary = info.summary;
        this.emoji = info.emoji;
        this.admin = info.admin ?? false;
        this.beta = info.beta ?? false;
        this.hidden = info.hidden ?? false;
        this.versions = info.versions;
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    exec(cmd: CommandInterface, message: discord.Message): void {}

    check(message: discord.Message): boolean {
        const errors = [];

        for (let i = 0; i < this.versions.length; i++) {
            const version = this.versions[i];

            try {
                const parsed = version.check(message);

                if (parsed) {
                    const cmd = new CommandInterface(this, version, parsed, message);

                    this.exec(cmd, message);

                    return true;
                }
            } catch (e) {
                if (e instanceof ArgError) {
                    errors.push(e);
                    continue;
                }

                throw e;
            }
        }

        if (errors.length) logger.error("Errors:", errors);
    }
}

export type CommandTriggerFunc = (message: discord.Message) => Promise<boolean>;
export type CommandTrigger = string;

export interface VersionInfo {
    summary: string;
    triggers: CommandTrigger[];
    args: ArgumentGroup;
}

interface ParsedArg {
    value: any;
    type: ArgumentType;
}

type ParsedArgs = {
    [K: string]: ParsedArg[];
}

export class CommandVersion implements VersionInfo {
    summary: string;
    triggers: CommandTrigger[];
    args: ArgumentGroup;

    constructor(triggers: CommandTrigger[], args: ArgumentGroup|Argument[], summary?: string) {
        this.triggers = triggers;
        this.args = new ArgumentGroup(Array.isArray(args) ? args : [args]);
        this.summary = summary;
    }

    private checkTrigger(message: discord.Message): string {
        const prefix = "c."; // Temporary trigger while there is no settings

        for (let i = 0; i < this.triggers.length; i++) {
            const trigger = this.triggers[i];

            if (message.content.startsWith(prefix + trigger)) {
                return message.content.slice(prefix.length + trigger.length);
            }
        }

        return null;
    }

    check(message: discord.Message): ParsedArgs {
        const rest = this.checkTrigger(message);

        if (typeof rest !== "string") {
            return null;
        }

        const parts = rest.split(" ").filter(_ => !!_);

        try {
            const parsedTuple = this.args.check(parts, message);

            if (!parsedTuple) {
                return null;
            }

            return parsedTuple[0];
        } catch (e) {
            if (e instanceof ArgError) {
                e.version = this;
            }

            throw e;
        }
    }
}

export interface BaseArgumentGroupOptions {
    repeat?: boolean;
    optional?: boolean;
    partial?: boolean;
    flexible?: boolean;
    priority?: number;
}

export interface RepeatingArgumentGroupOptions extends BaseArgumentGroupOptions {
    repeat?: true;
    repeatMin?: number;
    repeatMax?: number;
}

export interface OptionalArgumentGroupOptions extends BaseArgumentGroupOptions {
    optional?: true;
}

export interface PartialArgumentGroupOptions extends BaseArgumentGroupOptions {
    partial?: true;
}

export interface FlexibleArgumentGroupOptions extends BaseArgumentGroupOptions {
    flexible?: true;
}

export type ArgumentGroupOptions =
    BaseArgumentGroupOptions |
    RepeatingArgumentGroupOptions |
    OptionalArgumentGroupOptions |
    PartialArgumentGroupOptions |
    FlexibleArgumentGroupOptions;

export interface ArgumentGroupInfo {
    args: (Argument|ArgumentGroup)[];
    options: ArgumentGroupOptions;
}

export class ArgumentGroup implements ArgumentGroupInfo {
    isGroup = true as const;

    args: (Argument|ArgumentGroup)[];
    options: ArgumentGroupOptions;

    constructor(args: (Argument|ArgumentGroup)[], options: ArgumentGroupOptions = {}) {
        this.args = args;
        this.options = options;
    }

    /**
     * @returns A tuple containing the parsed arguments and also the part it got to the message before completing.
     */
    check(parts: string[], message: discord.Message): [ ParsedArgs, number ] {
        const parsed_args: ParsedArgs = {};

        for (let i = 0; i < this.args.length; i++) {
            const arg = this.args[i] as Argument;
            if (!arg.isGroup) {
                if (arg.default) {
                    if (parsed_args[arg.name]) {
                        parsed_args[arg.name].push(arg.default);
                    } else {
                        parsed_args[arg.name] = [arg.default];
                    }
                } else {
                    parsed_args[arg.name] = [];
                }
            }
        }

        const curRepeats: Map<ArgumentGroup, number> = new Map;

        const args: (Argument|ArgumentGroup)[] = [];
        for (let i = 0; i < this.args.length; i++) {
            const arg = this.args[i];
            if (arg.isGroup) {
                const minRepeats = (arg.options as RepeatingArgumentGroupOptions).repeatMin || 1;
                for (let i = 0; i < minRepeats; i++) {
                    args.push(arg);
                }
            } else {
                args.push(arg);
            }
        }

        if (this.options.repeat) {
            args.push(...args);
        }

        let argi = 0, parti = 0, success_at = -1;
        for (; argi < args.length && parti < parts.length; parti++) {
            const arg = args[argi];
            const part = parts[parti];

            if (!arg) {
                return null; // There are too many parameters supplied.
            }

            if (success_at !== -1) {
                const lookahead = args[argi + 1];

                if (lookahead) {
                    const options = arg.isGroup ? arg.options : arg as Argument;
                    const lookahead_options = lookahead.isGroup ? lookahead.options : lookahead as Argument;

                    if (options.priority <= lookahead_options.priority) {
                        if (lookahead.isGroup) {
                            try {
                                const parsedTuple = lookahead.check(parts.slice(parti).filter(_ => !!_), message);
                                if (parsedTuple) {
                                    argi++;
                                    if (!lookahead.options.repeat)
                                        argi++;

                                    success_at = -1;
                                    const parsed = parsedTuple[0];
                                    parti += parsedTuple[1];

                                    const just_parsed = Object.entries(parsed);
                                    for (let i = 0; i < just_parsed.length; i++) {
                                        const parg = just_parsed[i];
                                        parsed_args[parg[0]].push(...parg[1]);
                                    }

                                    if (lookahead.options.repeat) {
                                        const curRepeat = curRepeats.get(lookahead) || 1;

                                        curRepeats.set(lookahead, curRepeat + 1);
                                        if (curRepeat >= (lookahead.options as RepeatingArgumentGroupOptions).repeatMax) {
                                            argi++;
                                            continue;
                                        }
                                    }
                                    continue;
                                }
                            } catch (e) {
                                if (!(e instanceof ArgError)) {
                                    throw e;
                                }
                            }
                            // Continue to check if the current argument is still valid.
                        } else {
                            const single = lookahead as Argument;
                            const parsed = single.parse(part, message);

                            if (parsed) {
                                if (argi >= args.length / 2) {
                                    return [ parsed_args, parti - 2 ];
                                }

                                argi++;
                                parsed_args[single.name].push(parsed);
                                success_at = parti;
                                continue;
                            }
                        }
                    }
                }

                const single = arg as Argument;
                const parsed = single.parse(parts.slice(success_at, parti + 1).join(" "), message);

                if (parsed) {
                    parsed_args[single.name][parsed_args[single.name].length - 1] = parsed;
                } else {
                    argi++;
                    parti--;
                    success_at = -1;
                }
            } else {
                if (arg.isGroup) {
                    const group = arg as ArgumentGroup;
                    try {
                        const parsedTuple = group.check(parts.slice(parti).filter(_ => !!_), message);

                        if (parsedTuple) {
                            const parsed = parsedTuple[0];
                            parti += parsedTuple[1];

                            const just_parsed = Object.entries(parsed);
                            for (let i = 0; i < just_parsed.length; i++) {
                                const parg = just_parsed[i];
                                const name = parg[0];

                                if (!parsed_args[name]) {
                                    parsed_args[name] = [...parg[1]];
                                } else {
                                    parsed_args[name].push(...parg[1]);
                                }
                            }

                            if (group.options.repeat) {
                                const curRepeat = curRepeats.get(group) || 1;

                                curRepeats.set(group, curRepeat + 1);
                                if (curRepeat >= (group.options as RepeatingArgumentGroupOptions).repeatMax) {
                                    argi++;
                                    continue;
                                } else if (curRepeat <= (group.options as RepeatingArgumentGroupOptions).repeatMin) {
                                    argi++;
                                    continue;
                                }
                            } else {
                                argi++;
                            }
                        } else {
                            if (group.options.optional || this.options.partial) {
                                argi++;
                                parti--;
                            } else {
                                return null;
                            }
                        }
                    } catch (e) {
                        if (e instanceof ArgError) {
                            if (group.options.optional || this.options.partial) {
                                argi++;
                                parti--;
                            } else {
                                return null;
                            }
                        } else {
                            throw e;
                        }
                    }
                } else {
                    const single = arg as Argument;
                    const parsed = single.parse(part, message);

                    if (parsed) {
                        parsed_args[single.name].push(parsed);
                        success_at = parti;
                    } else {
                        if (single.optional || this.options.partial) {
                            argi++;
                            parti--;
                        } else {
                            return null;
                        }
                    }
                }
            }
        }

        if (this.options.repeat) { // Not enough arguments supplied
            if (argi < args.length / 2 - 1) {
                return null;
            }
        } else {
            if (argi < args.length - 1) {
                return null;
            }
        }

        return [ parsed_args, parti ];
    }
}

export interface ArgumentInfo {
    name: string;
    summary: string;
    emoji: string;
    types: ArgumentType[];
    optional?: boolean;
    priority?: number;
    literal?: boolean;
    default?: ParsedArg;
}

export class Argument implements ArgumentInfo {
    isGroup = false as const;

    name: string;
    summary: string;
    emoji: string;
    types: ArgumentType[];
    literal: boolean;
    optional: boolean;
    priority: number;
    default: ParsedArg;

    constructor(info: ArgumentInfo) {
        this.default = info.default;
        this.name = info.name;
        this.summary = info.summary;
        this.emoji = info.emoji;
        this.types = info.types;
        this.literal = info.literal ?? false;
        this.optional = info.optional ?? false;
        this.priority = info.priority || 0;
    }

    parse(part: string, message: discord.Message): ParsedArg {
        for (let i = 0; i < this.types.length; i++) {
            const type = this.types[i];
            try {
                const parsed = type.parse(part, message);

                if (parsed) {
                    return {
                        value: parsed,
                        type: type
                    };
                }
            } catch (e) {
                if (e instanceof ArgError) {
                    e.arg = this;
                }

                throw e;
            }
        }

        return null;
    }
}

export class Syntax extends Argument {
    constructor(name: string, optional = false, priority = 0) {
        super({
            name,
            optional,
            priority,
            summary: "",
            emoji: "",
            types: [],
            literal: true
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    parse(part: string, message: discord.Message): ParsedArg {
        if (part === this.name) {
            return {
                value: true,
                type: null
            };
        }

        return null;
    }
}

export interface ArgumentTypeInfo {
    name: string;
    summary: string;
}

export class ArgumentType<T = any> implements ArgumentTypeInfo {
    static RegExp?: RegExp;

    name: string;
    summary: string;

    constructor(info: ArgumentTypeInfo) {
        this.name = info.name;
        this.summary = info.summary;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    parse(part: string, message: discord.Message): T {
        throw new ArgError("Invalid argument type.");
    }
}

export interface IntegerInfo {
    min?: number;
    max?: number;
}

export class IntegerArgType extends ArgumentType<number> implements IntegerInfo {
    static RegExp = /^\d+$/

    min: number;
    max: number;

    constructor(info: IntegerInfo = {}) {
        super({
            name: "Integer",
            summary: "A whole number."
        });

        this.min = info.min ?? Number.MIN_SAFE_INTEGER;
        this.max = info.max ?? Number.MAX_SAFE_INTEGER;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    parse(part: string, message: discord.Message): any {
        if (!IntegerArgType.RegExp.test(part)) {
            throw new ArgError("Expected a valid integer, got `" + part + "`.");
        }

        const num = parseInt(part);
        if (isNaN(num)) {
            throw new ArgError("Expected a valid integer, got `" + part + "`.");
        }

        if (num < this.min) {
            throw new ArgError("Expected integer to be above `" + numeral(this.min).format("0,0") + "`.");
        }

        if (num > this.max) {
            throw new ArgError("Expected integer to be below `" + numeral(this.max).format("0,0") + "`");
        }

        return num;
    }
}

export interface TextInfo {
    maxLength?: number;
}

export class TextArgType extends ArgumentType<number> implements TextInfo {
    static RegExp = /^.+$/

    maxLength: number;

    constructor(info: TextInfo = {}) {
        super({
            name: "Text",
            summary: "Any text with spaces."
        });

        this.maxLength = info.maxLength ?? 0;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    parse(part: string, message: discord.Message): any {
        if (!TextArgType.RegExp.test(part)) {
            throw new ArgError("Expected text.");
        }

        if (this.maxLength && part.length > this.maxLength) {
            throw new ArgError("Expected text to be less than `" + this.maxLength + "` characters long.");
        }

        return part;
    }
}

export class ModuleService extends EventEmitter {
    loaded: Map<string, Module>;

    constructor() {
        super();

        this.loaded = new Map;
    }

    async load(filename: string): Promise<Module> {
        const dirname = path.resolve(__dirname, "..", "modules", filename);
        const rel = path.relative(process.cwd(), dirname);

        try {
            delete require.cache[dirname];
            const { default: loadedmod } = await import(dirname) as { default: { new(): Module } };

            const module = new loadedmod();

            if (module instanceof Module) {
                module.filename = filename;
                module.dirname = dirname;

                if (this.loaded.get(module.name))
                    return null;

                await module.loadAll();

                this.loaded.set(module.name, module);

                return module;
            } else {
                logger.error("Loaded module '" + rel + "' didn't export a module.");
            }
        } catch (e) {
            if (~e.toString().indexOf("Cannot find module '" + dirname))
                return null;

            if (~e.toString().indexOf("loadedmod is not a constructor")) {
                logger.error("Loaded module '" + rel + "' didn't export a module.");
                return null;
            }

            throw e;
        }
    }

    unload(module: string): Module {
        const loaded = this.loaded.get(module);

        if (loaded) {
            this.loaded.delete(module);

            return loaded;
        }

        return null;
    }

    async reload(module: string): Promise<Module> {
        const unloaded = this.unload(module);
        if (unloaded) {
            return this.load(module);
        }

        return null;
    }

    async loadAll(): Promise<Map<string, Module>> {
        const loaded: Map<string, Module> = new Map;

        const pathname = path.resolve(__dirname, "..", "modules");
        const module_files = await fs.readdir(pathname);

        for (let i = 0; i < module_files.length; i++) {
            const filename = module_files[i];

            const module = await this.load(filename);

            if (module) {
                loaded.set(module.name, module);
            }
        }

        return loaded;
    }
}

export default new ModuleService;

(async () => {
    const a = new ModuleService;

    const mod = await a.load("fun");
    const cmd = mod.commands[0];
    const msg = new (discord.Message as any) as discord.Message;
    msg.content = "c.wyr a b or b c or d e";

    await cmd.check(msg);
})();
