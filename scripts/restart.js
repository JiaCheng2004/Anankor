const { spawn } = require("node:child_process");

async function startAnankor() {
    const child = spawn("npm", ["start"], {
        stdio: "inherit",
        shell: true,
        detached: true,
    });
    child.on("error", (err) => {
        console.error(`Failed to start Anankor: ${err.message}`);
    });
    child.unref();
}

setTimeout(startAnankor, 5000);

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
