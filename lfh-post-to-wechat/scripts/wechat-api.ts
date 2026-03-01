import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

interface WechatConfig {
  appId: string;
  appSecret: string;
}

interface AccessTokenResponse {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
}

interface UploadResponse {
  media_id: string;
  url: string;
  errcode?: number;
  errmsg?: string;
}

interface PublishResponse {
  media_id?: string;
  errcode?: number;
  errmsg?: string;
}

type ArticleType = "news" | "newspic";

interface ArticleOptions {
  title: string;
  author?: string;
  digest?: string;
  content: string;
  thumbMediaId: string;
  articleType: ArticleType;
  imageMediaIds?: string[];
}

interface PublishLogEntry {
  title: string;
  mediaId: string;
  timestamp: string;
  contentHash: string;
}

function computeContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getPublishLogPath(): string {
  return path.join(process.cwd(), ".wechat-publish-log.json");
}

function readPublishLog(): PublishLogEntry[] {
  const logPath = getPublishLogPath();
  if (!fs.existsSync(logPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(logPath, "utf-8"));
  } catch {
    return [];
  }
}

function writePublishLog(entries: PublishLogEntry[]): void {
  const maxEntries = 50;
  const trimmed = entries.slice(-maxEntries);
  fs.writeFileSync(getPublishLogPath(), JSON.stringify(trimmed, null, 2), "utf-8");
}

function findDuplicate(title: string, contentHash: string): PublishLogEntry | undefined {
  const log = readPublishLog();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  return log.find(entry =>
    entry.title === title &&
    entry.contentHash === contentHash &&
    new Date(entry.timestamp).getTime() > oneHourAgo
  );
}

function recordPublish(title: string, mediaId: string, contentHash: string): void {
  const log = readPublishLog();
  log.push({ title, mediaId, timestamp: new Date().toISOString(), contentHash });
  writePublishLog(log);
}

function loadEnvFile(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;

  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

const DEFAULT_API_BASE = "https://wechat.lifenghua.cn";

function getApiBase(): string {
  const envPaths = [
    path.join(process.cwd(), ".lfh-skills", ".env"),
    path.join(os.homedir(), ".lfh-skills", ".env"),
  ];
  for (const p of envPaths) {
    const env = loadEnvFile(p);
    if (env.WECHAT_API_BASE_URL) return env.WECHAT_API_BASE_URL.replace(/\/+$/, "");
  }
  return process.env.WECHAT_API_BASE_URL?.replace(/\/+$/, "") || DEFAULT_API_BASE;
}

const API_BASE = getApiBase();
const TOKEN_URL = `${API_BASE}/cgi-bin/token`;
const UPLOAD_URL = `${API_BASE}/cgi-bin/material/add_material`;
const DRAFT_URL = `${API_BASE}/cgi-bin/draft/add`;

function loadConfig(): WechatConfig {
  const cwdEnvPath = path.join(process.cwd(), ".lfh-skills", ".env");
  const homeEnvPath = path.join(os.homedir(), ".lfh-skills", ".env");

  const cwdEnv = loadEnvFile(cwdEnvPath);
  const homeEnv = loadEnvFile(homeEnvPath);

  const appId = process.env.WECHAT_APP_ID || cwdEnv.WECHAT_APP_ID || homeEnv.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET || cwdEnv.WECHAT_APP_SECRET || homeEnv.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "Missing WECHAT_APP_ID or WECHAT_APP_SECRET.\n" +
      "Set via environment variables or in .lfh-skills/.env file."
    );
  }

  return { appId, appSecret };
}

function loadExtendConfig(): Record<string, string> {
  const locations = [
    path.join(process.cwd(), ".lfh-skills", "lfh-post-to-wechat", "EXTEND.md"),
    path.join(os.homedir(), ".lfh-skills", "lfh-post-to-wechat", "EXTEND.md"),
  ];
  for (const loc of locations) {
    if (!fs.existsSync(loc)) continue;
    const config: Record<string, string> = {};
    for (const line of fs.readFileSync(loc, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        config[trimmed.slice(0, colonIdx).trim().toLowerCase()] = trimmed.slice(colonIdx + 1).trim();
      }
    }
    return config;
  }
  return {};
}

function convertWebpToJpeg(webpBuffer: Buffer): Buffer | null {
  const tmpDir = os.tmpdir();
  const uid = `wechat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inPath = path.join(tmpDir, `${uid}.webp`);
  const outPath = path.join(tmpDir, `${uid}.jpg`);

  try {
    fs.writeFileSync(inPath, webpBuffer);

    // Resolve ffmpeg: prefer PATH, then common Windows locations
    const ffmpegCandidates = [
      "ffmpeg",
      "D:\\Apps\\ffmpeg\\bin\\ffmpeg.exe",
      "C:\\ffmpeg\\bin\\ffmpeg.exe",
      path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages", "ffmpeg"),
    ];
    const ffmpegBin = ffmpegCandidates.find((p) => {
      try { return spawnSync(p, ["-version"], { stdio: "pipe" }).status === 0; } catch { return false; }
    }) ?? "ffmpeg";

    const tools: [string, string[]][] = [
      [ffmpegBin, ["-y", "-i", inPath, "-q:v", "2", outPath]],
      ["magick", [inPath, outPath]],
      ["convert", [inPath, outPath]],
    ];

    for (const [cmd, args] of tools) {
      const result = spawnSync(cmd, args, { stdio: "pipe" });
      if (result.status === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
        return fs.readFileSync(outPath);
      }
    }

    // Windows fallback: PowerShell + System.Drawing
    const psInPath = inPath.replace(/\\/g, "\\\\");
    const psOutPath = outPath.replace(/\\/g, "\\\\");
    const ps = `Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${psInPath}'); $img.Save('${psOutPath}', [System.Drawing.Imaging.ImageFormat]::Jpeg); $img.Dispose()`;
    const psResult = spawnSync("powershell", ["-NonInteractive", "-Command", ps], { stdio: "pipe" });
    if (psResult.status === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
      return fs.readFileSync(outPath);
    }

    return null;
  } finally {
    try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath); } catch {}
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
  }
}

async function fetchAccessToken(appId: string, appSecret: string): Promise<string> {
  const formBody = new URLSearchParams({
    grant_type: "client_credential",
    appid: appId,
    secret: appSecret,
  });

  console.error(`[wechat-api] Token endpoint: ${TOKEN_URL}`);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody.toString(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch access token: ${res.status}`);
  }
  const data = await res.json() as AccessTokenResponse;
  if (data.errcode) {
    throw new Error(`Access token error ${data.errcode}: ${data.errmsg}`);
  }
  if (!data.access_token) {
    throw new Error("No access_token in response");
  }
  return data.access_token;
}

async function uploadImage(
  imagePath: string,
  accessToken: string,
  baseDir?: string
): Promise<UploadResponse> {
  let fileBuffer: Buffer;
  let filename: string;
  let contentType: string;

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    const response = await fetch(imagePath);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${imagePath}`);
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error(`Remote image is empty: ${imagePath}`);
    }
    fileBuffer = Buffer.from(buffer);
    const urlPath = imagePath.split("?")[0];
    filename = path.basename(urlPath) || "image.jpg";
    contentType = response.headers.get("content-type") || "image/jpeg";
  } else {
    const resolvedPath = path.isAbsolute(imagePath)
      ? imagePath
      : path.resolve(baseDir || process.cwd(), imagePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Image not found: ${resolvedPath}`);
    }
    const stats = fs.statSync(resolvedPath);
    if (stats.size === 0) {
      throw new Error(`Local image is empty: ${resolvedPath}`);
    }
    fileBuffer = fs.readFileSync(resolvedPath);
    filename = path.basename(resolvedPath);
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };
    contentType = mimeTypes[ext] || "image/jpeg";
  }

  // WeChat API doesn't support WebP — convert to JPEG first
  if (contentType === "image/webp" || filename.toLowerCase().endsWith(".webp")) {
    console.error(`[wechat-api] Converting WebP → JPEG: ${filename}`);
    const jpegBuffer = convertWebpToJpeg(fileBuffer);
    if (!jpegBuffer) {
      throw new Error(
        `WebP conversion failed for ${filename}. Install ffmpeg or ImageMagick and ensure it's in PATH.`
      );
    }
    fileBuffer = jpegBuffer;
    filename = filename.replace(/\.webp$/i, ".jpg");
    contentType = "image/jpeg";
  }

  const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="media"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    "",
    "",
  ].join("\r\n");
  const footer = `\r\n--${boundary}--\r\n`;

  const headerBuffer = Buffer.from(header, "utf-8");
  const footerBuffer = Buffer.from(footer, "utf-8");
  const body = Buffer.concat([headerBuffer, fileBuffer, footerBuffer]);

  const url = `${UPLOAD_URL}?access_token=${accessToken}&type=image`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  const data = await res.json() as UploadResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`Upload failed ${data.errcode}: ${data.errmsg}`);
  }

  if (data.url?.startsWith("http://")) {
    data.url = data.url.replace(/^http:\/\//i, "https://");
  }

  return data;
}

async function uploadImagesInHtml(
  html: string,
  accessToken: string,
  baseDir: string
): Promise<{ html: string; firstMediaId: string; allMediaIds: string[] }> {
  const imgRegex = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  const matches = [...html.matchAll(imgRegex)];

  if (matches.length === 0) {
    return { html, firstMediaId: "", allMediaIds: [] };
  }

  let firstMediaId = "";
  let updatedHtml = html;
  const allMediaIds: string[] = [];

  for (const match of matches) {
    const [fullTag, src] = match;
    if (!src) continue;

    if (src.startsWith("https://mmbiz.qpic.cn")) {
      if (!firstMediaId) {
        firstMediaId = src;
      }
      continue;
    }

    const localPathMatch = fullTag.match(/data-local-path=["']([^"']+)["']/);
    const imagePath = localPathMatch ? localPathMatch[1]! : src;

    console.error(`[wechat-api] Uploading image: ${imagePath}`);
    try {
      const resp = await uploadImage(imagePath, accessToken, baseDir);
      const newTag = fullTag
        .replace(/\ssrc=["'][^"']+["']/, ` src="${resp.url}"`)
        .replace(/\sdata-local-path=["'][^"']+["']/, "");
      updatedHtml = updatedHtml.replace(fullTag, newTag);
      allMediaIds.push(resp.media_id);
      if (!firstMediaId) {
        firstMediaId = resp.media_id;
      }
    } catch (err) {
      console.error(`[wechat-api] Failed to upload ${imagePath}:`, err);
    }
  }

  return { html: updatedHtml, firstMediaId, allMediaIds };
}

async function publishToDraft(
  options: ArticleOptions,
  accessToken: string
): Promise<PublishResponse> {
  const url = `${DRAFT_URL}?access_token=${accessToken}`;

  let article: Record<string, unknown>;

  if (options.articleType === "newspic") {
    if (!options.imageMediaIds || options.imageMediaIds.length === 0) {
      throw new Error("newspic requires at least one image");
    }
    article = {
      article_type: "newspic",
      title: options.title,
      content: options.content,
      need_open_comment: 1,
      only_fans_can_comment: 0,
      image_info: {
        image_list: options.imageMediaIds.map(id => ({ image_media_id: id })),
      },
    };
    if (options.author) article.author = options.author;
  } else {
    article = {
      article_type: "news",
      title: options.title,
      content: options.content,
      thumb_media_id: options.thumbMediaId,
      need_open_comment: 1,
      only_fans_can_comment: 0,
    };
    if (options.author) article.author = options.author;
    if (options.digest) article.digest = options.digest;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ articles: [article] }),
  });

  const data = await res.json() as PublishResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`Publish failed ${data.errcode}: ${data.errmsg}`);
  }

  return data;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Record<string, string> = {};
  const lines = match[1]!.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2]! };
}

function renderMarkdownToHtml(markdownPath: string, theme: string = "default"): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const renderScript = path.join(__dirname, "md", "render.ts");
  const baseDir = path.dirname(markdownPath);

  console.error(`[wechat-api] Rendering markdown with theme: ${theme}`);
  const result = spawnSync("npx", ["-y", "bun", renderScript, markdownPath, "--theme", theme], {
    stdio: ["inherit", "pipe", "pipe"],
    cwd: baseDir,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || "";
    throw new Error(`Render failed: ${stderr}`);
  }

  const htmlPath = markdownPath.replace(/\.md$/i, ".html");
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML file not generated: ${htmlPath}`);
  }

  return htmlPath;
}

function extractHtmlContent(htmlPath: string): string {
  const html = fs.readFileSync(htmlPath, "utf-8");
  const match = html.match(/<div id="output">([\s\S]*?)<\/div>\s*<\/body>/);
  if (match) {
    return match[1]!.trim();
  }
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1]!.trim() : html;
}

function printUsage(): never {
  console.log(`Publish article to WeChat Official Account draft using API

Usage:
  npx -y bun wechat-api.ts <file> [options]

Arguments:
  file                Markdown (.md) or HTML (.html) file

Options:
  --type <type>       Article type: news (文章, default) or newspic (图文)
  --title <title>     Override title
  --author <name>     Author name (max 16 chars)
  --summary <text>    Article summary/digest (max 128 chars)
  --theme <name>      Theme name for markdown (default, grace, simple). Default: default
  --cover <path>      Cover image path (local or URL)
  --dry-run           Parse and render only, don't publish
  --skip-image-upload Keep CDN image URLs as-is, skip re-uploading to WeChat
  --force             Force publish even if duplicate detected (within 1 hour)
  --help              Show this help

Frontmatter Fields (markdown):
  title               Article title
  author              Author name
  digest/summary      Article summary
  coverImage/featureImage/cover/image   Cover image path

Comments:
  Comments are enabled by default, open to all users.

Environment Variables:
  WECHAT_APP_ID       WeChat App ID
  WECHAT_APP_SECRET   WeChat App Secret

Config File Locations (in priority order):
  1. Environment variables
  2. <cwd>/.lfh-skills/.env
  3. ~/.lfh-skills/.env

Example:
  npx -y bun wechat-api.ts article.md
  npx -y bun wechat-api.ts article.md --theme grace --cover cover.png
  npx -y bun wechat-api.ts article.md --author "Author Name" --summary "Brief intro"
  npx -y bun wechat-api.ts article.html --title "My Article"
  npx -y bun wechat-api.ts images/ --type newspic --title "Photo Album"
  npx -y bun wechat-api.ts article.md --dry-run
`);
  process.exit(0);
}

interface CliArgs {
  filePath: string;
  isHtml: boolean;
  articleType: ArticleType;
  title?: string;
  author?: string;
  summary?: string;
  theme: string;
  cover?: string;
  dryRun: boolean;
  skipImageUpload: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
  }

  const args: CliArgs = {
    filePath: "",
    isHtml: false,
    articleType: "news",
    theme: "default",
    dryRun: false,
    skipImageUpload: false,
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--type" && argv[i + 1]) {
      const t = argv[++i]!.toLowerCase();
      if (t === "news" || t === "newspic") {
        args.articleType = t;
      }
    } else if (arg === "--title" && argv[i + 1]) {
      args.title = argv[++i];
    } else if (arg === "--author" && argv[i + 1]) {
      args.author = argv[++i];
    } else if (arg === "--summary" && argv[i + 1]) {
      args.summary = argv[++i];
    } else if (arg === "--theme" && argv[i + 1]) {
      args.theme = argv[++i]!;
    } else if (arg === "--cover" && argv[i + 1]) {
      args.cover = argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--skip-image-upload") {
      args.skipImageUpload = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg.startsWith("--") && argv[i + 1] && !argv[i + 1]!.startsWith("-")) {
      i++;
    } else if (!arg.startsWith("-")) {
      args.filePath = arg;
    }
  }

  if (!args.filePath) {
    console.error("Error: File path required");
    process.exit(1);
  }

  args.isHtml = args.filePath.toLowerCase().endsWith(".html");

  return args;
}

function extractHtmlTitle(html: string): string {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1]!;
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1]!.replace(/<[^>]+>/g, "").trim();
  return "";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const extendConfig = loadExtendConfig();

  const filePath = path.resolve(args.filePath);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const baseDir = path.dirname(filePath);
  let title = args.title || "";
  let author = args.author || "";
  let digest = args.summary || "";
  let htmlPath: string;
  let htmlContent: string;
  let frontmatter: Record<string, string> = {};

  if (args.isHtml) {
    htmlPath = filePath;
    htmlContent = extractHtmlContent(htmlPath);
    const mdPath = filePath.replace(/\.html$/i, ".md");
    if (fs.existsSync(mdPath)) {
      const mdContent = fs.readFileSync(mdPath, "utf-8");
      const parsed = parseFrontmatter(mdContent);
      frontmatter = parsed.frontmatter;
      if (!title && frontmatter.title) title = frontmatter.title;
      if (!author) author = frontmatter.author || "";
      if (!digest) digest = frontmatter.digest || frontmatter.summary || frontmatter.description || "";
    }
    if (!title) {
      title = extractHtmlTitle(fs.readFileSync(htmlPath, "utf-8"));
    }
    console.error(`[wechat-api] Using HTML file: ${htmlPath}`);
  } else {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = parseFrontmatter(content);
    frontmatter = parsed.frontmatter;
    const body = parsed.body;

    title = title || frontmatter.title || "";
    if (!title) {
      const h1Match = body.match(/^#\s+(.+)$/m);
      if (h1Match) title = h1Match[1]!;
    }
    if (!author) author = frontmatter.author || "";
    if (!digest) digest = frontmatter.digest || frontmatter.summary || frontmatter.description || "";

    console.error(`[wechat-api] Theme: ${args.theme}`);
    htmlPath = renderMarkdownToHtml(filePath, args.theme);
    console.error(`[wechat-api] HTML generated: ${htmlPath}`);
    htmlContent = extractHtmlContent(htmlPath);
  }

  if (!title) {
    console.error("Error: No title found. Provide via --title, frontmatter, or <title> tag.");
    process.exit(1);
  }

  if (!author && extendConfig.default_author) {
    author = extendConfig.default_author;
  }

  if (digest && digest.length > 120) {
    const truncated = digest.slice(0, 117);
    const lastPunct = Math.max(truncated.lastIndexOf("。"), truncated.lastIndexOf("，"), truncated.lastIndexOf("；"), truncated.lastIndexOf("、"));
    digest = lastPunct > 80 ? truncated.slice(0, lastPunct + 1) : truncated + "...";
    console.error(`[wechat-api] Digest truncated to ${digest.length} chars`);
  }

  console.error(`[wechat-api] Title: ${title}`);
  if (author) console.error(`[wechat-api] Author: ${author}`);
  if (digest) console.error(`[wechat-api] Digest: ${digest.slice(0, 50)}...`);
  console.error(`[wechat-api] Type: ${args.articleType}`);

  if (args.dryRun) {
    console.log(JSON.stringify({
      articleType: args.articleType,
      title,
      author: author || undefined,
      digest: digest || undefined,
      htmlPath,
      contentLength: htmlContent.length,
    }, null, 2));
    return;
  }

  const config = loadConfig();
  const skipImageUpload = args.skipImageUpload ||
    ["1", "true", "yes"].includes((extendConfig.skip_image_upload ?? "").toLowerCase());

  console.error("[wechat-api] Fetching access token...");
  const accessToken = await fetchAccessToken(config.appId, config.appSecret);

  let firstMediaId = "";
  let allMediaIds: string[] = [];

  if (skipImageUpload) {
    console.error("[wechat-api] Skipping image upload (CDN images kept as-is)");
    const firstImgMatch = htmlContent.match(/<img[^>]*\ssrc=["']([^"']+)["']/i);
    if (firstImgMatch) firstMediaId = firstImgMatch[1]!;
  } else {
    console.error("[wechat-api] Uploading images...");
    const result = await uploadImagesInHtml(htmlContent, accessToken, baseDir);
    htmlContent = result.html;
    firstMediaId = result.firstMediaId;
    allMediaIds = result.allMediaIds;
  }

  let thumbMediaId = "";
  const rawCoverPath = args.cover ||
    frontmatter.coverImage ||
    frontmatter.featureImage ||
    frontmatter.cover ||
    frontmatter.image;
  const coverPath = rawCoverPath && !path.isAbsolute(rawCoverPath) && args.cover
    ? path.resolve(process.cwd(), rawCoverPath)
    : rawCoverPath;

  if (coverPath) {
    console.error(`[wechat-api] Uploading cover: ${coverPath}`);
    const coverResp = await uploadImage(coverPath, accessToken, baseDir);
    thumbMediaId = coverResp.media_id;
  } else if (firstMediaId) {
    if (firstMediaId.startsWith("https://")) {
      console.error(`[wechat-api] Uploading first image as cover: ${firstMediaId}`);
      const coverResp = await uploadImage(firstMediaId, accessToken, baseDir);
      thumbMediaId = coverResp.media_id;
    } else {
      thumbMediaId = firstMediaId;
    }
  }

  if (args.articleType === "news" && !thumbMediaId) {
    console.error("Error: No cover image. Provide via --cover, frontmatter.coverImage, or include an image in content.");
    process.exit(1);
  }

  if (args.articleType === "newspic" && allMediaIds.length === 0) {
    console.error("Error: newspic requires at least one image in content.");
    process.exit(1);
  }

  const contentHash = computeContentHash(title + htmlContent.slice(0, 2000));
  const duplicate = !args.force && findDuplicate(title, contentHash);
  if (duplicate) {
    console.error(`[wechat-api] Duplicate detected! Same title+content was published at ${duplicate.timestamp}, media_id: ${duplicate.mediaId}`);
    console.error("[wechat-api] Skipping duplicate publish. Use --force to override.");
    console.log(JSON.stringify({
      success: true,
      media_id: duplicate.mediaId,
      title,
      articleType: args.articleType,
      skipped: true,
      reason: "duplicate_detected",
      previousPublishTime: duplicate.timestamp,
    }, null, 2));
    return;
  }

  console.error("[wechat-api] Publishing to draft...");
  const result = await publishToDraft({
    title,
    author: author || undefined,
    digest: digest || undefined,
    content: htmlContent,
    thumbMediaId,
    articleType: args.articleType,
    imageMediaIds: args.articleType === "newspic" ? allMediaIds : undefined,
  }, accessToken);

  recordPublish(title, result.media_id || "", contentHash);

  console.log(JSON.stringify({
    success: true,
    media_id: result.media_id,
    title,
    articleType: args.articleType,
  }, null, 2));

  console.error(`[wechat-api] Published successfully! media_id: ${result.media_id}`);
}

await main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
