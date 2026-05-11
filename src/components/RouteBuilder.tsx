"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { buildAmapRideUrl, getPathFromRouteJson, type LngLat, type RouteJson } from "@/lib/amap-route";

declare global {
  interface Window {
    AMap?: AMapNamespace;
    _AMapSecurityConfig?: {
      securityJsCode: string;
    };
  }
}

interface AMapNamespace {
  Map: new (container: HTMLDivElement, options: Record<string, unknown>) => AMapMap;
  Polyline: new (options: Record<string, unknown>) => AMapOverlay;
  Marker: new (options: Record<string, unknown>) => AMapOverlay;
}

interface AMapMap {
  add: (overlays: AMapOverlay[]) => void;
  remove: (overlays: AMapOverlay[]) => void;
  setFitView: (overlays: AMapOverlay[], immediately?: boolean, avoid?: number[]) => void;
}

interface AMapOverlay {
  setPath?: (path: LngLat[]) => void;
  setPosition?: (position: LngLat) => void;
}

const amapKey = process.env.NEXT_PUBLIC_AMAP_KEY;
const amapSecurityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;

interface WanluRouteResponse {
  routeJson?: RouteJson;
  error?: string;
}

function loadAmapScript() {
  if (window.AMap) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-amap-sdk]");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve());
      existingScript.addEventListener("error", () => reject(new Error("高德 SDK 加载失败")));
      return;
    }

    if (!amapKey || !amapSecurityCode) {
      reject(new Error("缺少 NEXT_PUBLIC_AMAP_KEY 或 NEXT_PUBLIC_AMAP_SECURITY_CODE"));
      return;
    }

    window._AMapSecurityConfig = {
      securityJsCode: amapSecurityCode,
    };

    const script = document.createElement("script");
    script.dataset.amapSdk = "true";
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("高德 SDK 加载失败"));
    document.head.appendChild(script);
  });
}

export function RouteBuilder() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const overlaysRef = useRef<AMapOverlay[]>([]);
  const [urlText, setUrlText] = useState("");
  const [amapLink, setAmapLink] = useState("");
  const [status, setStatus] = useState("等待输入顽鹿平台 URL。");
  const [isLoading, setIsLoading] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);

  const configReady = useMemo(() => Boolean(amapKey && amapSecurityCode), []);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    loadAmapScript()
      .then(() => {
        if (!window.AMap || !mapContainerRef.current || mapRef.current) return;

        mapRef.current = new window.AMap.Map(mapContainerRef.current, {
          zoom: 13,
          center: [120.1202, 30.2286],
          viewMode: "2D",
        });
        setIsMapReady(true);
        setStatus("地图已就绪，输入顽鹿 URL 后可自动生成路线。");
      })
      .catch((error: Error) => {
        setStatus(error.message);
      });
  }, []);

  function drawRoute(routePath: LngLat[]) {
    const map = mapRef.current;
    if (!map || !window.AMap) return;

    if (overlaysRef.current.length) {
      map.remove(overlaysRef.current);
    }

    const polyline = new window.AMap.Polyline({
      path: routePath,
      strokeColor: "#197a5f",
      strokeWeight: 7,
      strokeOpacity: 0.95,
      lineJoin: "round",
      lineCap: "round",
      showDir: true,
    });
    const startMarker = new window.AMap.Marker({
      position: routePath[0],
      anchor: "bottom-center",
      label: { content: "起点", direction: "top" },
    });
    const endMarker = new window.AMap.Marker({
      position: routePath[routePath.length - 1],
      anchor: "bottom-center",
      label: { content: "终点", direction: "top" },
    });

    overlaysRef.current = [polyline, startMarker, endMarker];
    map.add(overlaysRef.current);
    map.setFitView(overlaysRef.current, false, [90, 40, 40, 40]);
  }

  function renderRoute(routeJson: RouteJson) {
    const routePath = getPathFromRouteJson(routeJson);
    if (routePath.length < 2) {
      setStatus("没有找到有效路线点：需要 data.steps[].path，并包含 lat/lng。");
      setAmapLink("");
      return;
    }

    drawRoute(routePath);
    setAmapLink(buildAmapRideUrl(routeJson, routePath));
    setStatus(`已转换 ${routePath.length} 个路线点，并生成高德骑行分享链接。`);
  }

  async function fetchAndRenderRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetUrl = urlText.trim();
    if (!targetUrl) {
      setStatus("请输入顽鹿平台 URL。");
      setAmapLink("");
      return;
    }

    setIsLoading(true);
    setAmapLink("");
    setStatus("正在获取顽鹿路线 JSON...");

    try {
      const response = await fetch("/api/wanlu-route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      const result = (await response.json()) as WanluRouteResponse;
      if (!response.ok || !result.routeJson) {
        throw new Error(result.error || "顽鹿路线获取失败。");
      }

      renderRoute(result.routeJson);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "顽鹿路线获取失败。");
      setAmapLink("");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyLink() {
    if (!amapLink) return;
    try {
      await navigator.clipboard.writeText(amapLink);
      setStatus("已复制高德骑行分享链接。");
    } catch {
      setStatus("复制失败，请手动选中链接复制。");
    }
  }

  return (
    <main className="app-shell">
      <section className="control-panel">
        <div className="eyebrow">AI Navigation</div>
        <h1>把顽鹿路线转成高德骑行链接</h1>
        <p className="intro">
          输入顽鹿平台路线 URL，页面会自动获取路线 JSON，按 BD-09 转高德坐标，画出路线，并生成可在高德 App 打开的骑行分享链接。
        </p>

        {!configReady ? (
          <div className="notice">请先在 `.env.local` 配置高德 `NEXT_PUBLIC_AMAP_KEY` 和 `NEXT_PUBLIC_AMAP_SECURITY_CODE`。</div>
        ) : null}

        <form className="route-form" onSubmit={fetchAndRenderRoute}>
          <label className="field-label" htmlFor="wanluUrl">
            顽鹿平台 URL
          </label>
          <input
            id="wanluUrl"
            className="url-input"
            value={urlText}
            onChange={(event) => setUrlText(event.target.value)}
            placeholder="https://..."
            type="url"
          />

          <button className="button-primary" disabled={!isMapReady || isLoading} type="submit">
            {isLoading ? "正在获取并转换..." : "自动获取并生成链接"}
          </button>
        </form>

        <label className="field-label" htmlFor="amapLink">
          高德骑行分享链接
        </label>
        <textarea id="amapLink" className="link-output" readOnly value={amapLink} placeholder="生成后可复制到手机浏览器打开" />

        <div className="action-grid">
          <button className="button-secondary" disabled={!amapLink} type="button" onClick={copyLink}>
            复制链接
          </button>
          <a className={`button-secondary ${amapLink ? "" : "is-disabled"}`} href={amapLink || undefined} target="_blank" rel="noreferrer">
            打开高德
          </a>
        </div>

        <p className="status">{status}</p>
      </section>

      <section className="map-card">
        <div ref={mapContainerRef} className="map-view" />
      </section>
    </main>
  );
}
