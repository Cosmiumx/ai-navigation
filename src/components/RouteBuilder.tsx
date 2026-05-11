"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
const maxJsonTextLength = 1_000_000;

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
  const [jsonText, setJsonText] = useState("");
  const [amapLink, setAmapLink] = useState("");
  const [status, setStatus] = useState("等待粘贴路线 JSON。");
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
        setStatus("地图已就绪，粘贴 JSON 后可生成路线。");
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

  function renderRoute() {
    let routeJson: RouteJson;

    if (jsonText.length > maxJsonTextLength) {
      setStatus("JSON 太大，请控制在 1MB 以内再解析。");
      setAmapLink("");
      return;
    }

    try {
      routeJson = JSON.parse(jsonText) as RouteJson;
    } catch {
      setStatus("JSON 解析失败，请确认粘贴的是完整接口返回。");
      setAmapLink("");
      return;
    }

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
        <h1>把路线 JSON 转成高德骑行链接</h1>
        <p className="intro">
          粘贴骑行路线接口数据，页面会按 BD-09 转高德坐标，画出路线，并生成可在高德 App 打开的骑行分享链接。
        </p>

        {!configReady ? (
          <div className="notice">请先在 `.env.local` 配置高德 `NEXT_PUBLIC_AMAP_KEY` 和 `NEXT_PUBLIC_AMAP_SECURITY_CODE`。</div>
        ) : null}

        <label className="field-label" htmlFor="jsonInput">
          路线 JSON
        </label>
        <textarea
          id="jsonInput"
          className="json-input"
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          placeholder="把完整接口 JSON 粘贴到这里"
        />

        <button className="button-primary" disabled={!isMapReady} type="button" onClick={renderRoute}>
          渲染路线并生成链接
        </button>

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
