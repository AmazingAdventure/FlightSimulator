import * as THREE from "three";
import { ROUTE_LEGS, RouteLeg, WAYPOINTS } from "./waypoints";

const WORLD_LEG_LENGTH = 8200;

export type FlightPhase = "takeoff" | "climb" | "cruise" | "approach" | "landed" | "complete";

export class RouteManager {
  private legIndex = 0;
  private progress = 0;
  readonly legLength = WORLD_LEG_LENGTH;

  get currentLeg(): RouteLeg {
    return ROUTE_LEGS[Math.min(this.legIndex, ROUTE_LEGS.length - 1)];
  }

  get currentLegIndex(): number {
    return Math.min(this.legIndex, ROUTE_LEGS.length - 1);
  }

  get displayLegNumber(): number {
    return this.currentLegIndex + 1;
  }

  get totalLegs(): number {
    return ROUTE_LEGS.length;
  }

  get allWaypoints() {
    return WAYPOINTS;
  }

  get progressRatio(): number {
    const ratio = this.progress / this.legLength;
    return Number.isFinite(ratio) ? THREE.MathUtils.clamp(ratio, 0, 1) : 0;
  }

  get remainingKm(): number {
    return this.currentLeg.distanceKm * (1 - this.progressRatio);
  }

  get isComplete(): boolean {
    return this.legIndex >= ROUTE_LEGS.length;
  }

  get hasReachedLegEnd(): boolean {
    return !this.isComplete && this.progressRatio >= 0.995;
  }

  get phase(): FlightPhase {
    if (this.legIndex >= ROUTE_LEGS.length) return "complete";
    const p = this.progressRatio;
    if (p < 0.08) return "takeoff";
    if (p < 0.23) return "climb";
    if (p < 0.78) return "cruise";
    if (p < 0.98) return "approach";
    return "landed";
  }

  get worldTarget(): THREE.Vector3 {
    return new THREE.Vector3(0, 260, -this.legLength);
  }

  getAirportPosition(which: "from" | "to"): THREE.Vector3 {
    return which === "from" ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0, 0, -this.legLength);
  }

  updateProgress(positionZ: number): void {
    this.progress = Number.isFinite(positionZ) ? THREE.MathUtils.clamp(-positionZ, 0, this.legLength) : 0;
  }

  advanceLeg(): boolean {
    if (this.legIndex >= ROUTE_LEGS.length - 1) {
      this.legIndex = ROUTE_LEGS.length;
      this.progress = this.legLength;
      return false;
    }

    this.legIndex += 1;
    this.progress = 0;
    return true;
  }

  jumpToLeg(index: number): void {
    this.legIndex = Number.isFinite(index) ? THREE.MathUtils.clamp(Math.trunc(index), 0, ROUTE_LEGS.length - 1) : 0;
    this.progress = 0;
  }

  reset(): void {
    this.legIndex = 0;
    this.progress = 0;
  }
}
