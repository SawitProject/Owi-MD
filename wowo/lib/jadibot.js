import fs from "fs";
import fsp from "fs/promises"; // fs.promises untuk operasi async
import path from "path";
import { fileURLToPath } from "url";

// Agar bisa pakai __dirname di ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pathJson = path.join(__dirname, "../db/jadibot.json");

async function fileExists(path) {
  try {
    await fsp.access(path);
    return true;
  } catch {
    return false;
  }
}

async function listJadibot() {
  if (!(await fileExists(pathJson))) {
    await fsp.writeFile(pathJson, JSON.stringify({}, null, 2), "utf8");
  }
  const data = await fsp.readFile(pathJson, "utf8");
  return JSON.parse(data);
}

async function deleteJadibot(number) {
  let jadibots = await listJadibot();
  if (jadibots[number]) {
    delete jadibots[number];
    await fsp.writeFile(pathJson, JSON.stringify(jadibots, null, 2), "utf8");
    return true;
  } else {
    console.log("Number not found");
    return false;
  }
}

async function getJadibot(number) {
  let jadibots = await listJadibot();
  return jadibots[number] || null;
}

async function updateJadibot(number, status) {
  let jadibots = await listJadibot();
  if (jadibots[number]) {
    jadibots[number].status = status;
  } else {
    jadibots[number] = { status: status };
  }
  await fsp.writeFile(pathJson, JSON.stringify(jadibots, null, 2), "utf8");
  return true;
}

/**
 * Update jadibot dengan info owner lengkap
 * @param {string} number - Nomor bot
 * @param {object} ownerInfo - Info owner { botNumber, ownerName, ownerNumber, createdAt, creatorBotName }
 */
async function updateJadibotWithOwner(number, ownerInfo) {
  let jadibots = await listJadibot();
  jadibots[number] = {
    ...jadibots[number],
    status: jadibots[number]?.status || "active",
    botNumber: ownerInfo.botNumber || number,
    ownerName: ownerInfo.ownerName || "Tidak Diketahui",
    ownerNumber: ownerInfo.ownerNumber || "",
    createdAt: ownerInfo.createdAt || new Date().toISOString(),
    creatorBotName: ownerInfo.creatorBotName || "Owi-MD",
  };
  await fsp.writeFile(pathJson, JSON.stringify(jadibots, null, 2), "utf8");
  return true;
}

/**
 * Get all jadibot with owner info
 * @param {string} number - Nomor bot
 * @returns {object|null} - Info owner atau null
 */
async function getAllJadibotWithOwner(number) {
  let jadibots = await listJadibot();
  if (jadibots[number]) {
    return {
      botNumber: jadibots[number].botNumber || number,
      ownerName: jadibots[number].ownerName || null,
      ownerNumber: jadibots[number].ownerNumber || null,
      createdAt: jadibots[number].createdAt || null,
      creatorBotName: jadibots[number].creatorBotName || null,
      status: jadibots[number].status || "inactive",
    };
  }
  return null;
}

export {
  listJadibot,
  deleteJadibot,
  updateJadibot,
  getJadibot,
  updateJadibotWithOwner,
  getAllJadibotWithOwner,
};
