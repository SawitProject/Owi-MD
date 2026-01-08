import mess from "../../strings.js";
import fs from "fs";
import { getGroupMetadata } from "../../lib/cache.js";

const dbPath = "./wowo/db/group.json";

function readDb() {
  try {
    if (!fs.existsSync(dbPath)) return {};
    const data = fs.readFileSync(dbPath, "utf-8");
    return JSON.parse(data || "{}");
  } catch (error) {
    return {};
  }
}

function saveDb(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error saving group DB:", error);
  }
}

async function sendMessage(sock, remoteJid, text, message) {
  try {
    await sock.sendMessage(remoteJid, { text }, { quoted: message });
  } catch (error) {
    console.error(`Failed to send message: ${error.message}`);
  }
}

async function handle(sock, messageInfo) {
  const { remoteJid, isGroup, message, sender, command, args } = messageInfo;

  if (!isGroup) {
    await sendMessage(sock, remoteJid, mess.general.isGroup, message);
    return;
  }

  try {
    const groupMetadata = await getGroupMetadata(sock, remoteJid);
    const participants = groupMetadata.participants;
    const isAdmin = participants.some(
      (p) => (p.phoneNumber === sender || p.id === sender) && p.admin
    );

    if (!isAdmin) {
      await sendMessage(sock, remoteJid, mess.general.isAdmin, message);
      return;
    }

    const db = readDb();
    if (!db[remoteJid]) {
      db[remoteJid] = {
        antilink: {
          status: false,
          mode: "delete", // delete, kick, both
          type: "all", // all, wa, youtube, tiktok, instagram
        },
      };
      saveDb(db);
    }

    const subCommand = args[0]?.toLowerCase();

    // Toggle on/off
    if (subCommand === "on") {
      db[remoteJid].antilink.status = true;
      saveDb(db);
      await sendMessage(
        sock,
        remoteJid,
        `✅ *ANTI LINK DIPERBAIKI* 🔒\n\n_Antilink sudah diaktifkan di grup ini._\n\nMode: ${db[remoteJid].antilink.mode}\nTipe: ${db[remoteJid].antilink.type}`,
        message
      );
      return;
    }

    if (subCommand === "off") {
      db[remoteJid].antilink.status = false;
      saveDb(db);
      await sendMessage(
        sock,
        remoteJid,
        `❌ *ANTI LINK DIMATIKAN* 🔓\n\n_Antilink sudah dinonaktifkan di grup ini._`,
        message
      );
      return;
    }

    // Set mode
    if (subCommand === "mode") {
      const mode = args[1]?.toLowerCase();
      if (!mode || !["delete", "kick", "both"].includes(mode)) {
        await sendMessage(
          sock,
          remoteJid,
          `⚠️ *Format Salah!*\n\n_Gunakan:*\n.antilink mode delete - hapus pesan saja\n.antilink mode kick - kick pengirim\n.antilink mode both - hapus + kick`,
          message
        );
        return;
      }
      db[remoteJid].antilink.mode = mode;
      saveDb(db);
      await sendMessage(
        sock,
        remoteJid,
        `✅ *Mode Diubah* ⚙️\n\n_Mode antilink sekarang: ${mode}_`,
        message
      );
      return;
    }

    // Set type
    if (subCommand === "type") {
      const type = args[1]?.toLowerCase();
      if (!type || !["all", "wa", "youtube", "tiktok", "instagram"].includes(type)) {
        await sendMessage(
          sock,
          remoteJid,
          `⚠️ *Format Salah!*\n\n_Gunakan:*\n.antilink type all - semua link\n.antilink type wa - link wa saja\n.antilink type youtube - link youtube\n.antilink type tiktok - link tiktok\n.antilink type instagram - link instagram`,
          message
        );
        return;
      }
      db[remoteJid].antilink.type = type;
      saveDb(db);
      await sendMessage(
        sock,
        remoteJid,
        `✅ *Tipe Diubah* 📝\n\n_Tipe antilink sekarang: ${type}_`,
        message
      );
      return;
    }

    // Show current settings
    const settings = db[remoteJid].antilink;
    const statusText = settings.status ? "✅ AKTIF" : "❌ NONAKTIF";
    await sendMessage(
      sock,
      remoteJid,
      `🔗 *ANTI LINK SETTINGS* 🔗

*Status:* ${statusText}
*Mode:* ${settings.mode}
*Tipe:* ${settings.type}

━━━━━━━━━━━━━━━━━━━
*Cara Penggunaan:*
.antilink on - Aktifkan
.antilink off - Nonaktifkan
.antilink mode [delete/kick/both]
.antilink type [all/wa/youtube/tiktok/instagram]
━━━━━━━━━━━━━━━━━━━

_*Note:* Hanya admin yang dapat menggunakan perintah ini._`,
      message
    );
  } catch (error) {
    console.error(`Error in antilink handle: ${error.message}`);
  }
}

export default {
  handle,
  Commands: ["antilink", "antilinks", "anti-link"],
  OnlyPremium: false,
  OnlyOwner: false,
};
