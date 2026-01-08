import mess from "../../strings.js";
import { getGroupMetadata } from "../../lib/cache.js";
import { logWithTime } from "../../lib/utils.js";

async function sendMessage(sock, remoteJid, text, message) {
  try {
    await sock.sendMessage(remoteJid, { text }, { quoted: message });
  } catch (error) {
    console.error(`Failed to send message: ${error.message}`);
  }
}

async function handle(sock, messageInfo) {
  const { remoteJid, message, sender, args, content, isGroup } = messageInfo;

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

    const subCommand = args[0]?.toLowerCase();
    const messageContent = content?.trim() || "";

    // Generate mention list
    const mentions = participants.map((member) => member.id);
    const mentionTags = participants.map((member) => `@${member.id.split("@")[0]}`);

    // Parse options
    let header = "👥";
    let footer = "═";
    let showCount = true;

    // Check for custom header/footer
    if (args.some((arg) => arg.startsWith("-h:"))) {
      const hArg = args.find((arg) => arg.startsWith("-h:"));
      header = hArg.replace("-h:", "") || "👥";
    }
    if (args.some((arg) => arg.startsWith("-f:"))) {
      const fArg = args.find((arg) => arg.startsWith("-f:"));
      footer = fArg.replace("-f:", "") || "═";
    }
    if (args.includes("-nocount")) {
      showCount = false;
    }

    // Filter out options from content
    let cleanContent = messageContent;
    cleanContent = cleanContent.replace(/-h:\S+/g, "").replace(/-f:\S+/g, "").replace(/-nocount/g, "").trim();

    // Help command
    if (subCommand === "help" || subCommand === "?") {
      const helpText = `══✪〘 *📋 TAG ALL HELP* 〙✪══

*Perintah:*

.${"tagall"} [pesan] - Tag semua member
.${"tagall"} -h:EMOJI - Ganti header
.${"tagall"} -f:TEXT - Ganti footer
.${"tagall"} -nocount - Sembunyikan jumlah member

*Contoh:*
.${"tagall"} Ayo kita belajar!
.${"tagall"} Rapat jam 7 malam -h:📢 -f:⚡

*Admin Only!*
`;
      await sendMessage(sock, remoteJid, helpText, message);
      return;
    }

    // Build message
    const memberCount = participants.length;
    let tagMessage = "";

    if (cleanContent) {
      tagMessage = `${header} *${cleanContent}* ${footer}\n\n`;
    } else {
      tagMessage = `${header} *PENTING!* ${footer}\n\n`;
    }

    // Add mentions
    const chunkSize = 80; // Mention in chunks to avoid limits
    if (mentionTags.length <= chunkSize) {
      tagMessage += mentionTags.join("\n");
    } else {
      // Split into multiple messages if too many members
      for (let i = 0; i < mentionTags.length; i += chunkSize) {
        const chunk = mentionTags.slice(i, i + chunkSize);
        tagMessage += chunk.join("\n") + "\n\n";
      }
    }

    if (showCount) {
      tagMessage += `\n${footer}\n📊 Total: *${memberCount}* member`;
    }

    // Send the message
    await sock.sendMessage(remoteJid, { text: tagMessage, mentions }, { quoted: message });

    logWithTime("TAGALL", `Tag all executed by ${sender} in ${remoteJid}`);
  } catch (error) {
    console.error("Error in tagall:", error);
    await sendMessage(sock, remoteJid, `⚠️ Error: ${error.message}`, message);
  }
}

export default {
  handle,
  Commands: ["tagall", "tagalll", "tagall"],
  OnlyPremium: false,
  OnlyOwner: false,
};
