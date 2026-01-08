import fs from "fs";
import path from "path";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";
import config from "../config.js";

const logger = pino({ level: "silent" });
import { connectToWhatsApp } from "../../lib/connection.js";
import { updateJadibot, updateJadibotWithOwner } from "../../lib/jadibot.js";

import {
  logWithTime,
  success,
  danger,
  deleteFolderRecursive,
} from "../../lib/utils.js";
import { sessions } from "../../lib/cache.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SESSION_PATH = "./session/";

async function startNewSession(masterSessions, senderId, type_connection, ownerInfo) {
  logWithTime("System", `Menjalankan startNewSession untuk ${senderId}`, "merah");
  const sessionFolder = path.join(SESSION_PATH, senderId);

  if (!fs.existsSync(sessionFolder)) {
    await fs.promises.mkdir(sessionFolder, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: logger,
    printQRInTerminal: false,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
  });

  if (!sock.authState.creds.registered && type_connection == "pairing") {
    const phoneNumber = senderId;
    await delay(4000);
    const code = await sock.requestPairingCode(phoneNumber.trim());
    logWithTime("System", `Pairing Code : ${code}`);
    const textResponse = `⏳ _Jadibot ${senderId}_\n
_Code Pairing :_ ${code}`;
    await masterSessions.sock.sendMessage(
      masterSessions.remoteJid,
      { text: textResponse },
      { quoted: masterSessions.message }
    );
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && type_connection === "qr") {
      logWithTime("System", `Menampilkan QR`);
      await masterSessions.sock.sendMessage(
        masterSessions.remoteJid,
        { text: "Menampilkan QR" },
        { quoted: masterSessions.message }
      );

      qrcode.generate(qr, { small: true }, (qrcodeStr) =>
        console.log(qrcodeStr)
      );
    }

    if (connection === "close") {
      const reason =
        new Boom(lastDisconnect?.error)?.output?.statusCode || "Unknown";
      const reasonMessages = {
        [DisconnectReason.badSession]: "Bad Session File, Start Again ...",
        [DisconnectReason.connectionClosed]:
          "Connection closed, reconnecting...",
        [DisconnectReason.connectionLost]:
          "Connection Lost from Server, reconnecting...",
        [DisconnectReason.connectionReplaced]:
          "Connection Replaced, Another New Session Opened",
        [DisconnectReason.loggedOut]:
          "Perangkat Terkeluar, Silakan Scan/Pairing Ulang",
        [DisconnectReason.restartRequired]: "Restart Required, Restarting...",
        [DisconnectReason.timedOut]: "Connection TimedOut, Reconnecting...",
      };

      const message =
        reasonMessages[reason] || `Unknown DisconnectReason: ${reason}`;

      if (reason === DisconnectReason.loggedOut) {
        const sessionPath = path.join(SESSION_PATH, senderId);
        const sessionExists = fs.existsSync(sessionPath);
        if (sessionExists) {
          deleteFolderRecursive(sessionPath);
          await masterSessions.sock.sendMessage(
            masterSessions.remoteJid,
            { text: `✅ _Perangkat Terkeluar, Silakan Scan/Pairing Ulang_` },
            { quoted: masterSessions.message }
          );
        }
      }
      if (reason === DisconnectReason.restartRequired) {
        logWithTime("System", message);
        if (sock) {
          await sock.ws.close();
        }
        await connectToWhatsApp(`session/${senderId}`);
      } else if (reason == 405) {
        await updateJadibot(senderId, "inactive");
        await masterSessions.sock.sendMessage(
          masterSessions.remoteJid,
          {
            text: `⚠️ _Ada masalah saat terhubung ke socket_\n\n_Silakan Ketik *.jadibot stop ${senderId}* untuk berhenti_`,
          },
          { quoted: masterSessions.message }
        );
        return;
      } else {
        danger("Jadibot", message);
      }
    }

    if (connection === "open") {
      success("System", "JADIBOT TERHUBUNG");
      
      // Simpan info owner dan creator
      await updateJadibot(senderId, "active");
      await updateJadibotWithOwner(senderId, {
        botNumber: senderId,
        ownerName: ownerInfo.name,
        ownerNumber: ownerInfo.number,
        createdAt: new Date().toISOString(),
        creatorBotName: config.owner_name,
      });
      
      await masterSessions.sock.sendMessage(
        masterSessions.remoteJid,
        { text: `✅ _Berhasil! Nomor *${senderId}* telah menjadi bot._\n\n_👤 Owner: ${ownerInfo.name}_` },
        { quoted: masterSessions.message }
      );
      if (sock) {
        await sock.ws.close();
        await connectToWhatsApp(`session/${senderId}`);
      }
    }
  });

  return sock;
}

async function handle(sock, messageInfo) {
  const { remoteJid, message, sender, prefix, command, content } = messageInfo;

  // Parse sub-command
  const args = content ? content.trim().split(" ") : [];
  const subCommand = args[0] ? args[0].toLowerCase() : null;
  const targetArg = args[1] || null;

  // ==================== SUBCOMMAND: LIST (BISA DIPAKAI SEMUA ORANG) ====================
  if (subCommand === "list" || command === "listjadibot") {
    try {
      await sock.sendMessage(remoteJid, {
        react: { text: "📋", key: message.key },
      });

      const { getAllJadibotWithOwner, getJadibot } = require("../../lib/jadibot.js");

      if (!fs.existsSync(SESSION_PATH)) {
        await sock.sendMessage(
          remoteJid,
          { text: `⚠️ _Tidak ada jadibot yang aktif._` },
          { quoted: message }
        );
        return;
      }

      const sessionFolders = fs.readdirSync(SESSION_PATH).filter((folderName) => {
        const folderPath = path.join(SESSION_PATH, folderName);
        return fs.lstatSync(folderPath).isDirectory();
      });

      if (sessionFolders.length === 0) {
        await sock.sendMessage(
          remoteJid,
          { text: `╔══════════════════════════════════════╗
║     📋 DAFTAR JADIBOT AKTIF 📋        ║
╚══════════════════════════════════════╝

_Belum ada yang menjadi bot._

_Type *.jadibot <nomor>* untuk buat bot_` },
          { quoted: message }
        );
        return;
      }

      // Build list dengan info lengkap
      let listText = `╔══════════════════════════════════════╗\n`;
      listText += `║     📋 DAFTAR JADIBOT AKTIF 📋        ║\n`;
      listText += `╚══════════════════════════════════════╝\n\n`;
      listText += `_*Dibuat oleh ${config.owner_name}*_\n`;
      if (config.owner_website) {
        listText += `_${config.owner_website}_\n`;
      }
      listText += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      let totalActive = 0;
      let totalInactive = 0;

      for (const folder of sessionFolders) {
        const botNumber = folder;
        const ownerInfo = await getAllJadibotWithOwner(botNumber);
        
        const status = await getJadibot(botNumber);
        
        const statusIcon = status?.status === "active" ? "🟢" : "🔴";
        const statusText = status?.status === "active" ? "Aktif" : "Tidak Aktif";
        const creatorBotName = ownerInfo?.creatorBotName || config.owner_name;
        
        totalActive += status?.status === "active" ? 1 : 0;
        totalInactive += status?.status !== "active" ? 1 : 0;

        listText += `${statusIcon} *JADIBOT #${sessionFolders.indexOf(folder) + 1}*\n`;
        listText += `├── 📱 Nomor Bot: @${botNumber}\n`;
        listText += `├── 👤 Owner: ${ownerInfo?.ownerName || "Tidak Diketahui"}\n`;
        listText += `├── 📞 No. Owner: ${ownerInfo?.ownerNumber || "Tidak Diketahui"}\n`;
        listText += `├── 📊 Status: ${statusText}\n`;
        listText += `├── 🏷️ Dibuat oleh: ${creatorBotName}\n`;
        
        if (ownerInfo?.createdAt) {
          const date = new Date(ownerInfo.createdAt);
          listText += `└── 📅 Dibuat: ${date.toLocaleDateString("id-ID")} ${date.toLocaleTimeString("id-ID")}\n`;
        } else {
          listText += `└── 📅 Dibuat: Tidak Diketahui\n`;
        }
        
        listText += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      }

      listText += `📊 *Ringkasan:*\n`;
      listText += `├─ 🟢 Aktif: ${totalActive}\n`;
      listText += `├─ 🔴 Tidak Aktif: ${totalInactive}\n`;
      listText += `└─ 📁 Total: ${sessionFolders.length}\n\n`;
      listText += `_Ketik *.jadibot <nomor>* untuk buat bot_\n`;
      listText += `_Ketik *.jadibot stop <nomor>* untuk berhenti_`;

      await sock.sendMessage(remoteJid, { text: listText }, { quoted: message });
    } catch (error) {
      console.error("Terjadi kesalahan di list:", error);
      await sock.sendMessage(
        remoteJid,
        { text: `⚠️ Terjadi kesalahan saat menampilkan daftar.` },
        { quoted: message }
      );
    }
    return;
  }

  // ==================== SUBCOMMAND: STOP (HANYA OWNER) ====================
  if (subCommand === "stop") {
    if (!targetArg) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `_⚠️ Format Penggunaan:_\n\n_💬 Contoh:_ _*${prefix}jadibot stop 6285246154386*_\n\n_Untuk lihat daftar:_ _*${prefix}jadibot list*_`,
        },
        { quoted: message }
      );
      return;
    }

    let targetNumber = targetArg.replace(/\D/g, "");
    if (targetNumber.length < 10 || targetNumber.length > 15) {
      await sock.sendMessage(
        remoteJid,
        { text: `⚠️ Nomor tidak valid.` },
        { quoted: message }
      );
      return;
    }

    if (!targetNumber.endsWith("@s.whatsapp.net")) {
      targetNumber += "@s.whatsapp.net";
    }

    await sock.sendMessage(remoteJid, {
      react: { text: "⏰", key: message.key },
    });

    const senderId = targetNumber.replace("@s.whatsapp.net", "");
    const sessionPath = path.join(SESSION_PATH, senderId);
    const sessionExists = fs.existsSync(sessionPath);

    const sockSesi = sessions.get(`session/${senderId}`);
    if (sockSesi) {
      const { updateJadibot, deleteJadibot } = require("../../lib/jadibot.js");
      await updateJadibot(senderId, "stop");
      await deleteJadibot(senderId);
      await sockSesi.ws.close();
      sessions.delete(`session/${senderId}`);
    }

    if (sessionExists) {
      deleteFolderRecursive(sessionPath);
      
      await sock.sendMessage(
        remoteJid,
        { text: `✅ _Jadibot ${senderId} berhasil dihentikan._` },
        { quoted: message }
      );
      const { updateJadibot } = require("../../lib/jadibot.js");
      await updateJadibot(senderId, "stop");
    } else {
      await sock.sendMessage(
        remoteJid,
        { text: `⚠️ _Folder sesi untuk ${senderId} tidak ditemukan._` },
        { quoted: message }
      );
    }
    return;
  }

  // ==================== SUBCOMMAND: CREATE JADIBOT (HANYA OWNER) ====================
  if (!content) {
    await sock.sendMessage(
      remoteJid,
      {
        text: `╔══════════════════════════════════════╗
║        📱 OWI-MD JADIBOT SYSTEM 📱       ║
╚══════════════════════════════════════╝

_⚠️ Format Penggunaan:_

🔹 *Buat Jadibot:*
_${prefix}${command} <nomor>_
_Contoh: ${prefix}${command} 6285246154386_

🔹 *Hentikan Jadibot:*
_${prefix}${command} stop <nomor>_
_Contoh: ${prefix}${command} stop 6285246154386_

🔹 *Lihat Daftar:*
_${prefix}${command} list_
_Atau: ${prefix}listjadibot_

_Owner: ${config.owner_name}_`,
      },
      { quoted: message }
    );
    return;
  }

  // Ekstrak nomor telepon
  let targetNumber = content.replace(/\D/g, "");
  if (targetNumber.length < 10 || targetNumber.length > 15) {
    await sock.sendMessage(
      remoteJid,
      { text: `⚠️ Nomor tidak valid.` },
      { quoted: message }
    );
    return;
  }

  if (!targetNumber.endsWith("@s.whatsapp.net")) {
    targetNumber += "@s.whatsapp.net";
  }

  const result = await sock.onWhatsApp(targetNumber);
  if (!result || result.length === 0 || !result[0].exists) {
    await sock.sendMessage(
      remoteJid,
      { text: `⚠️ Nomor tidak terdaftar di WhatsApp.` },
      { quoted: message }
    );
    return;
  }

  const type_connection = "pairing";

  try {
    await sock.sendMessage(remoteJid, {
      react: { text: "⏰", key: message.key },
    });

    const senderId = targetNumber.replace("@s.whatsapp.net", "");
    const sessionPath = path.join(SESSION_PATH, senderId);

    await updateJadibot(senderId, "inactive");

    const sockSesi = sessions.get(`session/${senderId}`);
    if (sockSesi) {
      await updateJadibot(senderId, "stop");
      await sockSesi.ws.close();
      sessions.delete(`session/${senderId}`);
    }

    // Info owner dari config
    const ownerInfo = {
      name: config.owner_name,
      number: sender.replace("@s.whatsapp.net", ""),
    };

    if (fs.existsSync(sessionPath)) {
      logWithTime(`Reload Session for ${senderId}`, message);
      await startNewSession(
        { sock, remoteJid, message },
        senderId,
        type_connection,
        ownerInfo
      );
    } else {
      await startNewSession(
        { sock, remoteJid, message },
        senderId,
        type_connection,
        ownerInfo
      );
    }
  } catch (error) {
    console.error("Terjadi kesalahan:", error);
    await sock.sendMessage(
      remoteJid,
      {
        text: `⚠️ Terjadi kesalahan saat memproses perintah.`,
      },
      { quoted: message }
    );
  }
}

export default {
  handle,
  Commands: ["jadibot", "listjadibot"],
  OnlyPremium: false,
  OnlyOwner: false, // listjadibot bisa dipakai semua orang
};
