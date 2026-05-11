export type LngLat = [number, number];

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteStep {
  path?: RoutePoint[];
}

export interface RouteJson {
  data?: {
    title?: string;
    name?: string;
    start_location?: string;
    end_location?: string;
    steps?: RouteStep[];
  };
}

export function bd09ToGcj02(lng: number, lat: number): LngLat {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin((y * Math.PI * 3000) / 180);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos((x * Math.PI * 3000) / 180);

  return [z * Math.cos(theta), z * Math.sin(theta)];
}

export function getPathFromRouteJson(routeJson: RouteJson): LngLat[] {
  const steps = Array.isArray(routeJson.data?.steps) ? routeJson.data.steps : [];
  const routePath = steps.flatMap((step) => {
    if (!Array.isArray(step.path)) return [];

    return step.path
      .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat))
      .map((point) => bd09ToGcj02(point.lng, point.lat));
  });

  return routePath.filter((point, index) => {
    if (index === 0) return true;
    const prevPoint = routePath[index - 1];
    return point[0] !== prevPoint[0] || point[1] !== prevPoint[1];
  });
}

function sampleViaPoints(routePath: LngLat[], maxCount: number) {
  const innerPoints = routePath.slice(1, -1);
  if (innerPoints.length <= maxCount) return innerPoints;

  const indexes = new Set<number>();
  for (let index = 0; index < maxCount; index += 1) {
    indexes.add(Math.round((index * (innerPoints.length - 1)) / (maxCount - 1)));
  }

  return [...indexes].sort((left, right) => left - right).map((index) => innerPoints[index]);
}

function encodeRoutePart(value: string) {
  return encodeURIComponent(value).replace(/%7C/g, "|");
}

function encodeQueryValue(value: string) {
  return encodeURIComponent(value).replace(/%2C/g, ",").replace(/%7C/g, "|");
}

export function buildAmapRideUrl(routeJson: RouteJson, routePath: LngLat[]) {
  const routeData = routeJson.data || {};
  const startPoint = routePath[0];
  const endPoint = routePath[routePath.length - 1];
  const startName = routeData.start_location || routeData.title || "路线起点";
  const endName = routeData.end_location || routeData.name || "路线终点";
  const viaPoints = sampleViaPoints(routePath, 16);
  const viaNames = viaPoints.map((_, index) => `途经点${index + 1}`);
  const latList = viaPoints.map((point) => point[1].toFixed(14)).join("|");
  const lngList = viaPoints.map((point) => point[0].toFixed(14)).join("|");
  const nameList = viaNames.join("|");
  const routeParts = [
    startPoint[1].toFixed(14),
    startPoint[0].toFixed(14),
    startName,
    endPoint[1].toFixed(14),
    endPoint[0].toFixed(14),
    endName,
    "",
    "3",
    "0",
    "",
    "",
    "",
    "",
    latList,
    lngList,
    nameList,
  ];
  const routeParam = routeParts.map(encodeRoutePart).join(",");
  const startAddress = encodeQueryValue(`${startPoint[0].toFixed(14)},${startPoint[1].toFixed(14)},${startName}`);
  const endAddress = encodeQueryValue(`${endPoint[0].toFixed(14)},${endPoint[1].toFixed(14)},${endName}`);
  const viaAddress = encodeQueryValue(`${lngList},${latList},${nameList}`);

  return `https://m.amap.com/navigation/ridemap/__r=${routeParam}&src=app_share&callnative=1&callapp=0&autoCall=1&saddr=${startAddress}&daddr=${endAddress}&viaaddr=${viaAddress}`;
}
