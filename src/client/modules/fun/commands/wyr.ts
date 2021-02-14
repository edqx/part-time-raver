import discord from "discord.js";
import { ArgumentGroup, Command, CommandVersion, Argument, TextArgType, Syntax, CommandInterface } from "../../../services/ModuleService";

export default class WouldYouRatherCommand extends Command {
    constructor() {
        super({
            name: "Would You Rather",
            summary: "Ask a would you rather question.",
            emoji: ":scales:",
            versions: [
                new CommandVersion(["wyr"], new ArgumentGroup([
                    new Argument({
                        name: "option",
                        summary: "The first option.",
                        emoji: ":one:",
                        types: [new TextArgType]
                    }),
                    new Syntax("or"),
                    new Argument({
                        name: "option",
                        summary: "The second option.",
                        emoji: ":two:",
                        types: [new TextArgType]
                    }),
                    new ArgumentGroup([
                        new Syntax("or"),
                        new Argument({
                            name: "option",
                            summary: "Any more options.",
                            emoji: ":1234:",
                            types: [new TextArgType]
                        })
                    ], {
                        priority: 1,
                        repeat: true,
                        repeatMax: 7
                    })
                ]))
            ]
        });
    }

    exec(cmd: CommandInterface, message: discord.Message): void {
        void cmd; void message;
        console.log(cmd.args);
    }
}
