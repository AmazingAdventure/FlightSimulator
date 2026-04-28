import "./styles.css";
import * as THREE from "three";
import { Aircraft } from "./aircraft/Aircraft";
import { InputManager } from "./input/InputManager";
import { RouteManager } from "./route/RouteManager";
import { FlightScene } from "./scene/FlightScene";
import { Hud } from "./ui/Hud";
import { CameraMode, SettingsState } from "./types";

const host = document.querySelector<HTMLDivElement>("#app");
if (!host) throw new Error("Missing #app host");

const settings: SettingsState = {
  cameraMode: "cockpit",
  weather: "clear",
  time: "dawn",
  quality: "high",
  paused: false
};

const route = new RouteManager();
const aircraft = new Aircraft();
const input = new InputManager();
const scene = new FlightScene(host, route);
const hud = new Hud(route, settings);
scene.addAircraft(aircraft);

hud.onCameraMode = (mode: CameraMode) => {
  settings.cameraMode = mode;
};
hud.onWeather = (weather) => {
  settings.weather = weather;
};
hud.onTime = (time) => {
  settings.time = time;
};
hud.onQuality = (quality) => {
  settings.quality = quality;
  scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1.25));
};
hud.onPause = () => {
  settings.paused = !settings.paused;
  hud.setPaused(settings.paused);
};
hud.onJumpLeg = (index) => {
  route.jumpToLeg(index);
  resetForLeg();
};

let last = performance.now();

function animate(now: number): void {
  requestAnimationFrame(animate);
  const dt = Math.min(0.045, (now - last) / 1000);
  last = now;

  const controls = input.sample();
  if (controls.pauseToggle) {
    settings.paused = !settings.paused;
    hud.setPaused(settings.paused);
  }
  if (controls.cameraNext) hud.cycleCamera();
  if (controls.reset) resetForLeg();

  if (!settings.paused) {
    aircraft.update(dt, controls, route.worldTarget);
    route.updateProgress(aircraft.group.position.z);
    if (route.phase === "landed" && aircraft.group.position.y < 2 && aircraft.getTelemetry().airspeed < 46) {
      const advanced = route.advanceLeg();
      if (advanced) resetForLeg();
    }
  }

  hud.update(aircraft.getTelemetry());
  scene.update(dt, aircraft, settings);
}

function resetForLeg(): void {
  aircraft.reset(new THREE.Vector3(0, 1.4, 250));
  scene.rebuildAirports();
}

requestAnimationFrame(animate);
