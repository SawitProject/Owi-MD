import fs from "fs";
import { getGroupMetadata } from "../../lib/cache.js";
import { logWithTime } from "../../lib/utils.js";

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

// Pattern untuk mendeteksi berbagai jenis link
const linkPatterns = {
  all: /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9]+\.(com|org|net|io|co|id|me|tk|ml|ga|cf|gq|xyz|top|site|online|website|info|pro)|wa\.me\/\+?[0-9]+|chat\.whatsapp\.com\/[a-zA-Z0-9]+)/gi,
  wa: /(wa\.me\/\+?[0-9]+|chat\.whatsapp\.com\/[a-zA-Z0-9]+|whatsapp\.com\/channel)/gi,
  youtube: /(youtube\.com|youtu\.be|yt\.be)/gi,
  tiktok: /(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/gi,
  instagram: /(instagram\.com|instagr\.am)/gi,
};

// Kata-kata yang diizinkan (bukan link berbahaya)
const allowedKeywords = ["http", "https", "www", ".com", ".org", ".net"];

async function containsLink(text, type) {
  if (!text) return false;
  
  const pattern = linkPatterns[type] || linkPatterns.all;
  const matches = text.match(pattern);
  
  if (!matches) return false;
  
  // Filter: jika hanya mengandung kata yang diizinkan, bukan link aktif
  const hasRealLink = matches.some(link => {
    const cleanLink = link.toLowerCase().trim();
    // Abaikan jika hanya http:// atau https:// tanpa domain
    if (cleanLink === "http://" || cleanLink === "https://") return false;
    return true;
  });
  
  return hasRealLink;
}

async function process(sock, messageInfo) {
  const { remoteJid, isGroup, fullText, message, sender, pushName } = messageInfo;

  // Hanya proses di grup
  if (!isGroup) return true;
  
  // Abaikan jika bukan pesan teks
  if (!message?.conversation && !message?.extendedTextMessage?.text) return true;

  // Cek apakah bot adalah admin
  const groupMetadata = await getGroupMetadata(sock, remoteJid);
  const botId = sock.user?.id?.split(":)[0] + "@s.whatsapp.net";
  const botIsAdmin = groupMetadata?.participants?.some(
    (p) => p.id === botId && p.admin
  );

  if (!botIsAdmin) return true; // Bot bukan admin, lewati

  // Baca database grup
  const db = readDb();
  if (!db[remoteJid]) return true;
  
  const antilinkSettings = db[remoteJid].antilink;
  
  // Abaikan jika antilink tidak aktif
  if (!antilinkSettings?.status) return true;

  // Cek apakah pengirim adalah admin (admin tidak di)
  const participants = groupMetadata?.participants || [];
  const senderIsAdmin = participants.some(
    (p) => (p.phoneNumber === sender || p.id === sender) && p.admin
  );
  if (senderIsAdmin) return true;

  // Deteksi link
  const hasLink = await containsLink(fullText, antilinkSettings.type || "all");
  
  if (hasLink) {
    try {
      logWithTime("ANTI-LINK", `Link detected from ${sender} in ${remoteJid}`);

      // Hapus pesan
      try {
        await sock.sendMessage(remoteJid, {
          delete: {
            remoteJid: remoteJid,
            fromMe: false,
            id: message.key.id,
            participant: sender,
          },
        });
      } catch (deleteError) {
        console.log("Could not delete message:", deleteError.message);
      }

      // Kirim peringatan
      const warnText = `⚠️ *ANTI LINK DETECTED* 🔗\n\n_Pengirim:_ @sender\n_Pesan:_ "${fullText.substring(0, 50)}${fullText.length > 50 ? "..." : ""}"\n\n_Type:_ ${antilinkSettings.type}\n_Mode:_ ${antilinkSettings.mode}`;

      await sock.sendMessage(remoteJid, {
        text: warnText,
        mentions: [sender],
      });

      // Kick jika mode = kick atau both
      if (["kick", "both"].includes(antilinkSettings.mode)) {
        try {
          await sock.groupParticipantsUpdate(remoteJid, [sender], "remove");
        } catch (kickError) {
          console.log("Could not kick user:", kickError.message);
        }
      }
    } catch (error) {
      console.error("Error in antilink process:", error.message);
    }
  }

  return true;
}

export default {
  name: "Anti Link Handler",
  priority: 15,
  process,
};
