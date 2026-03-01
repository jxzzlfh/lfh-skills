import type { CliArgs } from "../types";

export function getDefaultModel(): string {
  return process.env.VOLCENGINE_IMAGE_MODEL || "doubao-seedream-5-0-260128";
}

function getApiKey(): string | null {
  return process.env.VOLCENGINE_API_KEY || null;
}

function getBaseUrl(): string {
  const base = process.env.VOLCENGINE_BASE_URL || "https://ark.cn-beijing.volces.com";
  return base.replace(/\/+$/g, "");
}

function parseAspectRatio(ar: string): { width: number; height: number } | null {
  const match = ar.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const w = parseFloat(match[1]!);
  const h = parseFloat(match[2]!);
  if (w <= 0 || h <= 0) return null;
  return { width: w, height: h };
}

function getSizeFromQuality(quality: CliArgs["quality"]): string {
  // VolcEngine supports: "1K", "2K", "4K"
  if (quality === "normal") return "1K";
  return "2K"; // default
}

function getSizeFromAspectRatio(ar: string | null, quality: CliArgs["quality"]): string {
  // VolcEngine supports size: "1K", "2K", "4K"
  // For simplicity, we use the quality-based size for now
  // Could be enhanced to calculate dimensions based on aspect ratio
  return getSizeFromQuality(quality);
}

export async function generateImage(
  prompt: string,
  model: string,
  args: CliArgs
): Promise<Uint8Array> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("VOLCENGINE_API_KEY is required. Set VOLCENGINE_API_KEY environment variable.");

  if (args.referenceImages.length > 0) {
    throw new Error(
      "Reference images are not supported with VolcEngine provider in baoyu-image-gen. Use --provider google with a Gemini multimodal model."
    );
  }

  const size = args.size ? args.size : getSizeFromAspectRatio(args.aspectRatio, args.quality);
  const url = `${getBaseUrl()}/api/v3/images/generations`;

  // VolcEngine API uses OpenAI-compatible format
  const body = {
    model,
    prompt,
    size, // "1K", "2K", "4K"
    output_format: "png",
    watermark: false,
  };

  console.log(`Generating image with VolcEngine (${model})...`, { size });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`VolcEngine API error (${res.status}): ${err}`);
  }

  const result = await res.json() as {
    data?: Array<{
      url?: string;
      b64_json?: string;
    }>;
  };

  if (!result.data || result.data.length === 0) {
    console.error("Response:", JSON.stringify(result, null, 2));
    throw new Error("No image data in response from VolcEngine");
  }

  const imageData = result.data[0];

  if (imageData?.b64_json) {
    return Uint8Array.from(Buffer.from(imageData.b64_json, "base64"));
  }

  if (imageData?.url) {
    const imgRes = await fetch(imageData.url);
    if (!imgRes.ok) throw new Error("Failed to download image from VolcEngine");
    const buf = await imgRes.arrayBuffer();
    return new Uint8Array(buf);
  }

  throw new Error("No image in response from VolcEngine");
}
