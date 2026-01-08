import { reply } from "../../lib/utils.js";
import config from "../../config.js";

async function handle(sock, messageInfo) {
  const { m } = messageInfo;

  const text = `╔══════════════════════════════════════╗
║        📦 OWI-MD SOURCE CODE 📦         ║
╚══════════════════════════════════════╝

🔹 *Versi:* ${global.version}
🔹 *Developer:* ${config.owner_name}
🔹 *Tipe:* Plugin Base (ESM)
🔹 *Status:* Open Source & Free

╔══════════════════════════════════════╗
║           📁 REPOSITORY 📁            ║
╚══════════════════════════════════════╝

🌐 *GitHub Repository:*
${config.owner_website}

📥 *Clone Repository:*
\`\`\`git clone ${config.owner_website}.git\`\`\`

🔧 *Fitur:*
├─ 130+ Plugin
├─ Sistem Jadibot
├─ Multi Session
└─ Easy Configuration

💡 *Catatan:*
_Script ini TIDAK BOLEH diperjualbelikan!_`;

  await reply(m, text);
}

export default {
  handle,
  Commands: ["sc", "script"],
  OnlyPremium: false,
  OnlyOwner: false,
};
