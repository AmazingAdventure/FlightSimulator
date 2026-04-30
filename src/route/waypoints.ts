import * as THREE from "three";

export interface Waypoint {
  id: string;
  city: string;
  airport: string;
  code: string;
  lat: number;
  lon: number;
  accent: string;
}

export interface RouteLeg {
  from: Waypoint;
  to: Waypoint;
  distanceKm: number;
  bearingDeg: number;
}

const EARTH_RADIUS_KM = 6371;

export const WAYPOINTS: Waypoint[] = [
  { id: "calgary", city: "Calgary", airport: "Calgary Intl", code: "CYYC", lat: 51.122, lon: -114.014, accent: "#72d1ff" },
  { id: "san-francisco", city: "San Francisco", airport: "San Francisco Intl", code: "SFO", lat: 37.619, lon: -122.375, accent: "#ffad66" },
  { id: "chicago", city: "Chicago", airport: "O'Hare Intl", code: "ORD", lat: 41.974, lon: -87.907, accent: "#f8d56b" },
  { id: "dc", city: "Washington DC", airport: "Dulles Intl", code: "IAD", lat: 38.953, lon: -77.457, accent: "#ff866e" },
  { id: "newark", city: "Newark, New Jersey", airport: "Newark Liberty", code: "EWR", lat: 40.689, lon: -74.174, accent: "#a4f28a" },
  { id: "toronto", city: "Toronto", airport: "Pearson Intl", code: "YYZ", lat: 43.677, lon: -79.624, accent: "#96a8ff" },
  { id: "coventry", city: "Coventry", airport: "Coventry Airport", code: "EGBE", lat: 52.369, lon: -1.479, accent: "#f6a6ff" },
  { id: "copenhagen", city: "Copenhagen", airport: "Kastrup", code: "CPH", lat: 55.618, lon: 12.656, accent: "#9af3d2" },
  { id: "dubai", city: "Dubai", airport: "Dubai Intl", code: "DXB", lat: 25.253, lon: 55.365, accent: "#ffbf7d" },
  { id: "mumbai", city: "Bombay / Mumbai", airport: "Chhatrapati Shivaji", code: "BOM", lat: 19.09, lon: 72.865, accent: "#ffd1e1" },
  { id: "bengaluru", city: "Bangalore / Bengaluru", airport: "Kempegowda Intl", code: "BLR", lat: 13.198, lon: 77.706, accent: "#b3ff7a" },
  { id: "bhubaneswar", city: "Bhubaneswar", airport: "Biju Patnaik Intl", code: "BBI", lat: 20.244, lon: 85.818, accent: "#ffea78" }
];

export const ROUTE_LEGS: RouteLeg[] = WAYPOINTS.slice(0, -1).map((from, index) => {
  const to = WAYPOINTS[index + 1];
  return {
    from,
    to,
    distanceKm: haversineDistance(from, to),
    bearingDeg: bearing(from, to)
  };
});

export function haversineDistance(a: Waypoint, b: Waypoint): number {
  const dLat = THREE.MathUtils.degToRad(b.lat - a.lat);
  const dLon = THREE.MathUtils.degToRad(b.lon - a.lon);
  const lat1 = THREE.MathUtils.degToRad(a.lat);
  const lat2 = THREE.MathUtils.degToRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function bearing(a: Waypoint, b: Waypoint): number {
  const lat1 = THREE.MathUtils.degToRad(a.lat);
  const lat2 = THREE.MathUtils.degToRad(b.lat);
  const dLon = THREE.MathUtils.degToRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (THREE.MathUtils.radToDeg(Math.atan2(y, x)) + 360) % 360;
}
