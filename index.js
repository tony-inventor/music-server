import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

// 👇 Adjust these paths
const MUSIC_FOLDER = "H:\\M\\TYPE-Music\\music";
const WINAMP_CLI = "H:\\M\\TYPE-Mcp\\music-server\\winamp-cli.py";

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a", ".wma"];

async function runWinampCli(...args) {
  try {
    const { stdout, stderr } = await execFileAsync("python", [WINAMP_CLI, ...args]);
    return (stdout || stderr || "Done.").trim();
  } catch (err) {
    const msg = err.stderr || err.stdout || err.message;
    if (msg.includes("Winamp not running")) return "Error: Winamp is not running.";
    return `Error: ${msg.trim()}`;
  }
}

const server = new McpServer({ name: "music-server", version: "2.0.0" });

// ── Playback controls ──────────────────────────────────────────────────────

server.tool("winamp_play", "Start playback in Winamp", {}, async () => ({
  content: [{ type: "text", text: await runWinampCli("play") }],
}));

server.tool("winamp_pause", "Pause or resume playback", {}, async () => ({
  content: [{ type: "text", text: await runWinampCli("pause") }],
}));

server.tool("winamp_stop", "Stop playback", {}, async () => ({
  content: [{ type: "text", text: await runWinampCli("stop") }],
}));

server.tool("winamp_next", "Skip to next track", {
  count: z.number().int().min(1).max(20).optional().describe("How many tracks to skip (default 1)"),
}, async ({ count = 1 }) => ({
  content: [{ type: "text", text: await runWinampCli("next", String(count)) }],
}));

server.tool("winamp_prev", "Go to previous track", {
  count: z.number().int().min(1).max(20).optional().describe("How many tracks to go back (default 1)"),
}, async ({ count = 1 }) => ({
  content: [{ type: "text", text: await runWinampCli("prev", String(count)) }],
}));

// ── Volume controls ────────────────────────────────────────────────────────

server.tool("winamp_set_volume", "Set Winamp volume to a specific percentage", {
  percent: z.number().int().min(0).max(100).describe("Volume percentage (0-100)"),
}, async ({ percent }) => ({
  content: [{ type: "text", text: await runWinampCli("vol", String(percent)) }],
}));

server.tool("winamp_get_volume", "Get current Winamp volume", {}, async () => ({
  content: [{ type: "text", text: await runWinampCli("getvol") }],
}));

server.tool("winamp_volume_up", "Increase Winamp volume by one step", {
  steps: z.number().int().min(1).max(20).optional().describe("Number of steps (default 1)"),
}, async ({ steps = 1 }) => ({
  content: [{ type: "text", text: await runWinampCli("vup", String(steps)) }],
}));

server.tool("winamp_volume_down", "Decrease Winamp volume by one step", {
  steps: z.number().int().min(1).max(20).optional().describe("Number of steps (default 1)"),
}, async ({ steps = 1 }) => ({
  content: [{ type: "text", text: await runWinampCli("vdown", String(steps)) }],
}));

// ── File / library tools ───────────────────────────────────────────────────

server.tool("winamp_play_file", "Play a specific music file in Winamp", {
  filepath: z.string().describe("Absolute or relative path to the music file"),
}, async ({ filepath }) => {
  const abs = path.isAbsolute(filepath) ? filepath : path.join(MUSIC_FOLDER, filepath);
  if (!fs.existsSync(abs)) {
    return { content: [{ type: "text", text: `File not found: ${abs}` }] };
  }
  return { content: [{ type: "text", text: await runWinampCli("play", abs) }] };
});

server.tool("list_music_files", "List all music files in the music folder", {
  subfolder: z.string().optional().describe("Optional subfolder to list"),
}, async ({ subfolder }) => {
  const targetDir = path.resolve(subfolder ? path.join(MUSIC_FOLDER, subfolder) : MUSIC_FOLDER);
  if (!fs.existsSync(targetDir)) {
    return { content: [{ type: "text", text: `Folder not found: ${targetDir}` }] };
  }
  const files = fs.readdirSync(targetDir, { withFileTypes: true })
    .filter(f => f.isFile() && AUDIO_EXTENSIONS.includes(path.extname(f.name).toLowerCase()))
    .map(f => path.resolve(targetDir, f.name)); // absolute path per file
  return {
    content: [{
      type: "text",
      text: files.length > 0
        ? `Found ${files.length} file(s):\n${files.join("\n")}`
        : "No music files found.",
    }],
  };
});

server.tool("list_subfolders", "List subfolders inside the music folder", {
  subfolder: z.string().optional().describe("Optional subfolder to explore"),
}, async ({ subfolder }) => {
  const targetDir = subfolder ? path.join(MUSIC_FOLDER, subfolder) : MUSIC_FOLDER;
  if (!fs.existsSync(targetDir)) {
    return { content: [{ type: "text", text: `Folder not found: ${targetDir}` }] };
  }
  const folders = fs.readdirSync(targetDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
  return {
    content: [{
      type: "text",
      text: folders.length > 0 ? `Subfolders:\n${folders.join("\n")}` : "No subfolders found.",
    }],
  };
});

server.tool("search_music", "Search for music files by filename", {
  query: z.string().describe("Search term to match against filenames"),
}, async ({ query }) => {
  const results = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        AUDIO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()) &&
        entry.name.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push(full.replace(MUSIC_FOLDER, "").replace(/^\\/, ""));
      }
    }
  }
  walk(MUSIC_FOLDER);
  return {
    content: [{
      type: "text",
      text: results.length > 0
        ? `Found ${results.length} match(es):\n${results.join("\n")}`
        : `No files matching "${query}".`,
    }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);