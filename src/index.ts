import * as fs from "node:fs";
import { shardStart } from "./shard";
import Logger from "./structures/Logger";
import { ThemeSelector } from "./utils/ThemeSelector";

const logger = new Logger();

const theme = new ThemeSelector();

/**
 * Sets the console window title.
 * @param title - The new title for the console window.
 */
function setConsoleTitle(title: string): void {
	// Write the escape sequence to change the console title
	process.stdout.write(`\x1b]0;${title}\x07`);
}

try {
	if (!fs.existsSync("./src/utils/AnankorLogo.txt")) {
		logger.error("AnankorLogo.txt file is missing");
		process.exit(1);
	}
	console.clear();
	// Set a custom title for the console window
	setConsoleTitle("Anankor");
	const logFile = fs.readFileSync("./src/utils/AnankorLogo.txt", "utf-8");
	console.log(theme.purpleNeon(logFile));
	shardStart(logger);
} catch (err) {
	logger.error("[CLIENT] An error has occurred:", err);
}

/**
 * Project: Anankor
 * Author: Appu
 * Main Contributor: LucasB25
 * Company: Coders
 * Copyright (c) 2024. All rights reserved.
 * This code is the property of Coder and may not be reproduced or
 * modified without permission. For more information, contact us at
 * https://discord.gg/YQsGbTwPBx
 */
