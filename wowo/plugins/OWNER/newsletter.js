import mess from "../../strings.js";
import config from "../../config.js";

const newslettersCache = new Map();

async function sendMessage(sock, remoteJid, text, message) {
  try {
    await sock.sendMessage(remoteJid, { text }, { quoted: message });
  } catch (error) {
    console.error(`Failed to send message: ${error.message}`);
  }
}

async function handle(sock, messageInfo) {
  const { remoteJid, message, sender, args, command } = messageInfo;

  // Validasi owner
  const isOwner = config.owner_number.some((num) => sender.includes(num));
  if (!isOwner) {
    await sendMessage(sock, remoteJid, mess.general.isOwner, message);
    return;
  }

  const subCommand = args[0]?.toLowerCase();

  // Help command
  if (subCommand === "help" || !subCommand) {
    await sendMessage(
      sock,
      remoteJid,
      `📢 *NEWSLETTER MANAGEMENT* 📢

_*Owner Only*_

━━━━━━━━━━━━━━━━━━━
*Perintah:*

. newslist - Daftar newsletter yang bot ikuti
. newsinfo - Info newsletter saat ini
. newsdm [teks] - Kirim DM ke channel newsletter
. newsfollow [link] - Ikuti newsletter dari link
. newsunfollow - Berhenti follow newsletter saat ini
━━━━━━━━━━━━━━━━━━━

_*Contoh Penggunaan:*\n.newsdm Halo subscriber! 👋\n.newsfollow https://whatsapp.com/channel/xxxxx`,
      message
    );
    return;
  }

  // List newsletters yang bot ikuti
  if (subCommand === "list" || subCommand === "ls") {
    try {
      const subscribedNewsletters = Array.from(newslettersCache.values());
      
      if (subscribedNewsletters.length === 0) {
        await sendMessage(
          sock,
          remoteJid,
          `📭 *DAFTAR NEWSLETTER*\n\n_Bot belum mengikuti newsletter manapun._\n\n_Gunakan .newsfollow untuk mengikuti newsletter._`,
          message
        );
        return;
      }

      let text = `📢 *DAFTAR NEWSLETTER* (${subscribedNewsletters.length})\n\n`;
      
      for (let i = 0; i < subscribedNewsletters.length; i++) {
        const nl = subscribedNewsletters[i];
        text += `${i + 1}. *${nl.name || "Tanpa Nama"}*\n`;
        text += `   ID: ${nl.id || "N/A"}\n`;
        text += `   Follower: ${nl.followerCount || 0}\n`;
        text += `   Status: ${nl.isSubscribed ? "✅ Terhubung" : "❌ Terputus"}\n\n`;
      }

      text += `━━━━━━━━━━━━━━━━━━━\n`;
      text += `_Gunakan .newsinfo untuk info detail_`;

      await sendMessage(sock, remoteJid, text, message);
    } catch (error) {
      console.error("Error listing newsletters:", error);
      await sendMessage(
        sock,
        remoteJid,
        `❌ *Gagal mengambil daftar newsletter.*\n\n_Error: ${error.message}_`,
        message
      );
    }
    return;
  }

  // Info newsletter saat ini
  if (subCommand === "info" || subCommand === "current") {
    try {
      // Coba get metadata dari channel
      let newsletterInfo = {
        name: "Newsletter Tidak Dikenal",
        id: "Tidak tersedia",
        followerCount: 0,
        description: "Tidak tersedia",
        isSubscribed: false,
      };

      // Jika di channel newsletter
      if (remoteJid.includes("@newsletter")) {
        try {
          const metadata = await sock.newsletterGetBizInfo(remoteJid);
          if (metadata) {
            newsletterInfo = {
              name: metadata.name || "Tanpa Nama",
              id: metadata.id || remoteJid.split("@")[0],
              followerCount: metadata.followerCount || 0,
              description: metadata.description || "Tanpa deskripsi",
              isSubscribed: true,
            };
          }
        } catch (nlError) {
          console.log("Could not get newsletter metadata:", nlError.message);
        }
      } else {
        await sendMessage(
          sock,
          remoteJid,
          `⚠️ *BUKAN NEWSLETTER* 📨\n\n_Perintah ini hanya berfungsi di dalam channel newsletter._`,
          message
        );
        return;
      }

      const infoText = `📢 *NEWSLETTER INFO* 📨

*Nama:* ${newsletterInfo.name}
*ID:* ${newsletterInfo.id}
*Follower:* ${newsletterInfo.followerCount.toLocaleString()}
*Deskripsi:* ${newsletterInfo.description}
*Status:* ${newsletterInfo.isSubscribed ? "✅ Terhubung" : "❌ Terputus"}

━━━━━━━━━━━━━━━━━━━
*Untuk mengirim pesan ke newsletter, ketik:*\n.newsdm [isi pesan]`;

      await sendMessage(sock, remoteJid, infoText, message);
    } catch (error) {
      console.error("Error getting newsletter info:", error);
      await sendMessage(
        sock,
        remoteJid,
        `❌ *Gagal mengambil info newsletter.*\n\n_Error: ${error.message}_`,
        message
      );
    }
    return;
  }

  // Kirim DM ke newsletter/channel
  if (subCommand === "dm" || subCommand === "send") {
    const textMessage = args.slice(1).join(" ");
    
    if (!textMessage) {
      await sendMessage(
        sock,
        remoteJid,
        `⚠️ *FORMAT SALAH* 📝\n\n_Gunakan:*\n.newsdm Halo subscriber! 👋\n.newsdm [isi pesan]`,
        message
      );
      return;
    }

    // Validasi: harus di channel newsletter
    if (!remoteJid.includes("@newsletter")) {
      await sendMessage(
        sock,
        remoteJid,
        `⚠️ *BUKAN NEWSLETTER* 📨\n\n_Perintah ini hanya berfungsi di dalam channel newsletter._\n\n_Tidak bisa mengirim DM dari chat biasa._`,
        message
      );
      return;
    }

    try {
      // Kirim pesan ke newsletter
      await sock.sendMessage(remoteJid, {
        text: textMessage,
      });

      await sendMessage(
        sock,
        remoteJid,
        `✅ *PESANTerkirim* 📤\n\n_Pesan berhasil dikirim ke newsletter._\n\n_Isi Pesan:_ "${textMessage.substring(0, 50)}${textMessage.length > 50 ? "..." : ""}"`,
        message
      );
      
      logWithTime("NEWSLETTER", `Message sent to ${remoteJid}`);
    } catch (error) {
      console.error("Error sending to newsletter:", error);
      await sendMessage(
        sock,
        remoteJid,
        `❌ *GAGAL MENGIRIM* 📤\n\n_Error: ${error.message}_`,
        message
      );
    }
    return;
  }

  // Ikuti newsletter dari link
  if (subCommand === "follow" || subCommand === "add") {
    const link = args[1];
    
    if (!link) {
      await sendMessage(
        sock,
        remoteJid,
        `⚠️ *LINK DIPERLUKAN* 🔗\n\n_Gunakan:*\n.newsfollow https://whatsapp.com/channel/xxxxx\n.newsfollow [link newsletter]`,
        message
      );
      return;
    }

    try {
      // Ekstrak ID dari link
      // Format: https://whatsapp.com/channel/ABCDEFGHIJKLMNOP
      const match = link.match(/whatsapp\.com\/channel\/([a-zA-Z0-9]+)/);
      
      if (!match) {
        await sendMessage(
          sock,
          remoteJid,
          `⚠️ *LINK TIDAK VALID* 🔗\n\n_Format link harus seperti:*\nhttps://whatsapp.com/channel/ABCDEFGHIJKLMNOP`,
          message
        );
        return;
      }

      const newsletterJid = match[1] + "@newsletter";

      // Coba follow newsletter
      await sock.newsletterFollow(newsletterJid);
      
      // Simpan ke cache
      newslettersCache.set(newsletterJid, {
        id: match[1],
        addedAt: new Date().toISOString(),
        isSubscribed: true,
      });

      await sendMessage(
        sock,
        remoteJid,
        `✅ *BERHASIL MENGIKUTI* ✅\n\n_Newsletter berhasil diikuti._\n\n_ID:_ ${match[1]}\n_JID:_ ${newsletterJid}`,
        message
      );
      
      logWithTime("NEWSLETTER", `Followed newsletter ${newsletterJid}`);
    } catch (error) {
      console.error("Error following newsletter:", error);
      await sendMessage(
        sock,
        remoteJid,
        `❌ *GAGAL MENGIKUTI* ❌\n\n_Error: ${error.message}_\n\n_Pastikan link valid dan bot masih bisa mengakses._`,
        message
      );
    }
    return;
  }

  // Berhenti follow newsletter
  if (subCommand === "unfollow" || subCommand === "leave" || subCommand === "remove") {
    // Jika di dalam channel newsletter
    if (remoteJid.includes("@newsletter")) {
      try {
        await sock.newsletterUnfollow(remoteJid);
        newslettersCache.delete(remoteJid);

        await sendMessage(
          sock,
          remoteJid,
          `✅ *BERHENTI MENGIKUTI* ✅\n\n_Bot sudah tidak mengikuti newsletter ini lagi._`,
          message
        );
        
        logWithTime("NEWSLETTER", `Unfollowed newsletter ${remoteJid}`);
      } catch (error) {
        console.error("Error unfollowing newsletter:", error);
        await sendMessage(
          sock,
          remoteJid,
          `❌ *GAGAL BERHENTI* ❌\n\n_Error: ${error.message}_`,
          message
        );
      }
    } else {
      await sendMessage(
        sock,
        remoteJid,
        `⚠️ *BUKAN NEWSLETTER* 📨\n\n_Perintah ini hanya berfungsi di dalam channel newsletter._\n\n_Masuk ke channel newsletter dan ketik .newsunfollow_`,
        message
      );
    }
    return;
  }

  // Perintah tidak dikenali
  await sendMessage(
    sock,
    remoteJid,
    `⚠️ *PERINTAH TIDAK DIKENAL* ❓\n\n_Gunakan .newsletter help untuk melihat daftar perintah._`,
    message
  );
}

// Helper function untuk logging
function logWithTime(prefix, message) {
  const time = new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  console.log(`[${time}] [${prefix}] ${message}`);
}

export default {
  handle,
  Commands: ["newsletter", "news", "nl"],
  OnlyPremium: false,
  OnlyOwner: true,
};
