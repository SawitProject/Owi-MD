import mess from "../../strings.js";
import { getGroupMetadata } from "../../lib/cache.js";
import { downloadMedia, logWithTime } from "../../lib/utils.js";
import fs from "fs/promises";

async function sendMessage(sock, remoteJid, text, message) {
  try {
    await sock.sendMessage(remoteJid, { text }, { quoted: message });
  } catch (error) {
    console.error(`Failed to send message: ${error.message}`);
  }
}

async function handle(sock, messageInfo) {
  const { remoteJid, message, sender, args, content, isGroup, type, isQuoted } = messageInfo;

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

    // Check owner
    const isOwnerUser = global.db?.data?.users?.[sender]?.owner || 
                       global.db?.data?.users?.[sender]?.premium || false;

    if (!isAdmin && !isOwnerUser) {
      await sendMessage(sock, remoteJid, mess.general.isAdmin, message);
      return;
    }

    const subCommand = args[0]?.toLowerCase();
    const messageContent = content?.trim() || "";

    // Generate mention list (all participants)
    const mentions = participants.map((member) => member.id);

    // Help command
    if (subCommand === "help" || subCommand === "?") {
      const helpText = `══✪〘 *💨 HIDETAG HELP* 〙✪══

*Perintah:*

.${"hidetag"} [teks] - Kirim hidden tag
.${"hidetag"} [teks] -h:HEADER - Custom header
.${"hidetag"} [reply media] - Tag dengan reply media

*Fitur:*
- Mention semua member tanpa notif
- Bisa kirim media (gambar/video)
- Custom header/footer
- Mode quiet (tanpa notifikasi)

*Admin Only!*
`;
      await sendMessage(sock, remoteJid, helpText, message);
      return;
    }

    // Parse options
    let header = "🔔";
    let footer = "━";
    
    if (args.some((arg) => arg.startsWith("-h:"))) {
      const hArg = args.find((arg) => arg.startsWith("-h:"));
      header = hArg.replace("-h:", "") || "🔔";
    }
    if (args.some((arg) => arg.startsWith("-f:"))) {
      const fArg = args.find((arg) => arg.startsWith("-f:"));
      footer = fArg.replace("-f:", "") || "━";
    }

    // Clean content
    let cleanContent = messageContent;
    cleanContent = cleanContent
      .replace(/-h:\S+/g, "")
      .replace(/-f:\S+/g, "")
      .replace(/-header:\S+/g, "")
      .replace(/-footer:\S+/g, "")
      .trim();

    // Check for media
    let mediaBuffer = null;
    let mediaType = null;

    if (isQuoted) {
      try {
        const quotedType = Object.keys(isQuoted)[0]?.replace("Message", "");
        if (["image", "video", "audio", "document", "sticker"].includes(quotedType?.toLowerCase())) {
          const mediaPath = await downloadMedia(message, true);
          if (mediaPath) {
            mediaBuffer = await fs.readFile(mediaPath);
            mediaType = quotedType.toLowerCase();
          }
        }
      } catch (mediaError) {
        console.error("Media download error:", mediaError.message);
      }
    }

    // Build message text
    const memberCount = participants.length;
    let textMessage = "";

    if (cleanContent) {
      textMessage = `${header} *${cleanContent}* ${footer}\n\n💤 _Hidden mention untuk ${memberCount} member_`;
    } else {
      textMessage = `${header} *PENTING!* ${footer}\n\n💤 _Hidden mention untuk ${memberCount} member_`;
    }

    // Send based on media type
    if (mediaBuffer) {
      const sendOptions = {
        mentions,
        caption: cleanContent || undefined,
      };

      switch (mediaType) {
        case "image":
          await sock.sendMessage(remoteJid, { image: mediaBuffer, ...sendOptions }, { quoted: message });
          break;
        case "video":
          await sock.sendMessage(remoteJid, { video: mediaBuffer, ...sendOptions }, { quoted: message });
          break;
        case "audio":
          await sock.sendMessage(remoteJid, { audio: mediaBuffer, ...sendOptions }, { quoted: message });
          break;
        case "document":
          await sock.sendMessage(remoteJid, { document: mediaBuffer, ...sendOptions }, { quoted: message });
          break;
        case "sticker":
          await sock.sendMessage(remoteJid, { sticker: mediaBuffer, ...sendOptions }, { quoted: message });
          break;
        default:
          await sock.sendMessage(remoteJid, { text: textMessage, mentions }, { quoted: message });
      }
    } else {
      await sock.sendMessage(remoteJid, { text: textMessage, mentions }, { quoted: message });
    }

    logWithTime("HIDETAG", `Hidden tag executed by ${sender} in ${remoteJid}`);
  } catch (error) {
    console.error("Error in hidetag:", error);
    await sendMessage(sock, remoteJid, `⚠️ Error: ${error.message}`, message);
  }
}

export default {
  handle,
  Commands: ["hidetag", "h", "hidetak", "htag", "mentionall"],
  OnlyPremium: false,
  OnlyOwner: false,
};
