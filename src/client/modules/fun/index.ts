import { Module } from "../../services/ModuleService";

import WouldYouRatherCommand from "./commands/wyr";

export default class FunModule extends Module {
    constructor() {
        super({
            name: "Fun",
            summary: "A module for entertainment and random things.",
            emoji: ":game_die:",
            admin: false,
            beta: false,
            hidden: false,
            commands: [new WouldYouRatherCommand]
        });
    }
}
