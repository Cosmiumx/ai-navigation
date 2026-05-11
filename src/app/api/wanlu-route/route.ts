import { lookup } from "node:dns/promises";
import { NextRequest, NextResponse } from "next/server";
import type { RouteJson } from "@/lib/amap-route";

export const runtime = "nodejs";

const maxResponseBytes = 5_000_000;
const requestTimeoutMs = 12_000;
const userAgent = "AI-Navigation/1.0 (+route-json-fetcher)";

function isPrivateAddress(address: string) {
  if (address === "::1") return true;
  if (address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;

  const segments = address.split(".").map(Number);
  if (segments.length !== 4 || segments.some((segment) => !Number.isInteger(segment))) return false;

  const [first, second] = segments;
  return first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 169 && second === 254) || first === 0;
}

async function assertPublicUrl(targetUrl: URL) {
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    throw new Error("仅支持 http 或 https 链接。");
  }

  const records = await lookup(targetUrl.hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error("不支持访问本地或内网地址。");
  }
}

function hasRoutePath(value: unknown): value is RouteJson {
  if (!value || typeof value !== "object") return false;

  const routeJson = value as RouteJson;
  return Array.isArray(routeJson.data?.steps) && routeJson.data.steps.some((step) => Array.isArray(step.path) && step.path.length > 0);
}

function findRouteJson(value: unknown, seen = new WeakSet<object>()): RouteJson | null {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (hasRoutePath(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRouteJson(item, seen);
      if (found) return found;
    }
    return null;
  }

  for (const item of Object.values(value)) {
    const found = findRouteJson(item, seen);
    if (found) return found;
  }

  return null;
}

function parseJsonText(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function extractRouteJsonFromText(text: string): RouteJson | null {
  const directJson = parseJsonText(text);
  const directRoute = findRouteJson(directJson);
  if (directRoute) return directRoute;

  const scriptMatches = text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scriptMatches) {
    const scriptText = decodeHtmlEntities(match[1].trim());
    const parsedScript = parseJsonText(scriptText);
    const scriptRoute = findRouteJson(parsedScript);
    if (scriptRoute) return scriptRoute;
  }

  return null;
}

function getWanluApiCandidates(targetUrl: URL) {
  const routeId = targetUrl.searchParams.get("id");
  if (!routeId || !/^\d+$/.test(routeId)) return [];

  const routeType = targetUrl.searchParams.get("routeType");
  const candidates = [new URL(`/api/road/road_book/${routeId}`, targetUrl.origin)];
  if (routeType === "myroute") {
    candidates.unshift(new URL(`/indoor/v1/navigation/share/detail/${routeId}`, targetUrl.origin));
  }

  return candidates;
}

async function readLimitedResponse(response: Response) {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxResponseBytes) {
    throw new Error("顽鹿页面数据过大，已停止解析。");
  }

  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maxResponseBytes) {
      throw new Error("顽鹿页面数据过大，已停止解析。");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url?: unknown };
    if (typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "请输入顽鹿平台 URL。" }, { status: 400 });
    }

    const targetUrl = new URL(url.trim());
    await assertPublicUrl(targetUrl);

    const urlsToFetch = [...getWanluApiCandidates(targetUrl), targetUrl];
    let lastError = "未在该 URL 中找到 data.steps[].path 路线 JSON。";

    for (const fetchUrl of urlsToFetch) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      const response = await fetch(fetchUrl, {
        headers: {
          accept: "application/json,text/html;q=0.9,*/*;q=0.8",
          referer: targetUrl.toString(),
          "user-agent": userAgent,
        },
        redirect: "follow",
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        lastError = `顽鹿数据请求失败：HTTP ${response.status}`;
        continue;
      }

      const text = await readLimitedResponse(response);
      const routeJson = extractRouteJsonFromText(text);
      if (routeJson) {
        return NextResponse.json({ routeJson });
      }
    }

    return NextResponse.json({ error: lastError }, { status: 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取顽鹿路线失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
