import { AircraftTelemetry, CameraMode, SettingsState, TimeMode, WeatherMode } from "../types";
import { RouteManager } from "../route/RouteManager";

const cameraModes: CameraMode[] = ["cockpit", "chase", "cinematic", "map"];
const weatherModes: WeatherMode[] = ["clear", "mist", "storm"];
const timeModes: TimeMode[] = ["dawn", "day", "dusk", "night"];

export class Hud {
  private root = document.createElement("div");
  private speed = document.createElement("strong");
  private altitude = document.createElement("strong");
  private vsi = document.createElement("strong");
  private heading = document.createElement("strong");
  private throttle = document.createElement("div");
  private attitude = document.createElement("div");
  private pitchTape = document.createElement("div");
  private routeTitle = document.createElement("div");
  private routeMeta = document.createElement("div");
  private progressFill = document.createElement("div");
  private warning = document.createElement("div");
  private controls = document.createElement("div");
  private settingsPanel = document.createElement("div");
  private legSelect = document.createElement("select");

  onCameraMode?: (mode: CameraMode) => void;
  onWeather?: (weather: WeatherMode) => void;
  onTime?: (time: TimeMode) => void;
  onQuality?: (quality: SettingsState["quality"]) => void;
  onPause?: () => void;
  onJumpLeg?: (index: number) => void;

  constructor(private route: RouteManager, private settings: SettingsState) {
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="topbar">
        <div>
          <span class="eyebrow">Cessna 172 Skyhawk</span>
          <h1>World Hop</h1>
        </div>
        <div class="status-pills">
          <span data-pill="phase">TAKEOFF</span>
          <span data-pill="ap">AP OFF</span>
        </div>
      </div>
    `;

    const instruments = document.createElement("section");
    instruments.className = "instruments";
    instruments.append(
      this.instrument("Airspeed", this.speed, "kt"),
      this.instrument("Altitude", this.altitude, "ft"),
      this.instrument("Vertical", this.vsi, "fpm"),
      this.instrument("Heading", this.heading, "deg")
    );

    const horizon = document.createElement("section");
    horizon.className = "horizon";
    this.attitude.className = "attitude";
    this.pitchTape.className = "pitch-tape";
    this.attitude.append(this.pitchTape, marker("wing left"), marker("nose"), marker("wing right"));
    this.throttle.className = "throttle-fill";
    const throttleWrap = document.createElement("div");
    throttleWrap.className = "throttle";
    throttleWrap.append(this.throttle);
    horizon.append(this.attitude, throttleWrap);

    const routePanel = document.createElement("section");
    routePanel.className = "route-panel";
    this.routeTitle.className = "route-title";
    this.routeMeta.className = "route-meta";
    const progress = document.createElement("div");
    progress.className = "route-progress";
    this.progressFill.className = "route-progress-fill";
    progress.append(this.progressFill);
    routePanel.append(this.routeTitle, this.routeMeta, progress);

    this.warning.className = "warning";
    this.warning.textContent = "STALL";

    this.controls.className = "control-strip";
    this.controls.innerHTML = `
      <span>W/S pitch</span>
      <span>A/D roll</span>
      <span>Q/E rudder</span>
      <span>+/- throttle</span>
      <span>F flaps</span>
      <span>P autopilot</span>
      <span>C camera</span>
    `;

    this.buildSettings();
    this.root.append(instruments, horizon, routePanel, this.warning, this.controls, this.settingsPanel);
    document.body.append(this.root);
  }

  update(telemetry: AircraftTelemetry): void {
    const leg = this.route.currentLeg;
    this.speed.textContent = telemetry.airspeed.toFixed(0);
    this.altitude.textContent = telemetry.altitude.toFixed(0);
    this.vsi.textContent = telemetry.verticalSpeed.toFixed(0);
    this.heading.textContent = telemetry.heading.toFixed(0).padStart(3, "0");
    this.throttle.style.height = `${Math.round(telemetry.throttle * 100)}%`;
    this.attitude.style.transform = `rotate(${telemetry.roll}deg)`;
    this.pitchTape.style.transform = `translateY(${telemetry.pitch * 1.6}px)`;
    this.routeTitle.textContent = `${leg.from.code} ${leg.from.city} -> ${leg.to.code} ${leg.to.city}`;
    this.routeMeta.textContent = `${this.route.phase.toUpperCase()} | Leg ${this.route.currentLegIndex + 1}/${this.route.totalLegs} | ${this.route.remainingKm.toFixed(0)} km | ${leg.bearingDeg.toFixed(0).padStart(3, "0")} deg`;
    this.progressFill.style.width = `${this.route.progressRatio * 100}%`;
    this.warning.classList.toggle("visible", telemetry.stall);
    this.root.querySelector('[data-pill="phase"]')!.textContent = this.route.phase.toUpperCase();
    this.root.querySelector('[data-pill="ap"]')!.textContent = telemetry.autopilot ? "AP ON" : "AP OFF";
    this.root.classList.toggle("paused", this.settings.paused);
  }

  setPaused(paused: boolean): void {
    this.settings.paused = paused;
    this.settingsPanel.classList.toggle("open", paused);
  }

  cycleCamera(): void {
    const next = cameraModes[(cameraModes.indexOf(this.settings.cameraMode) + 1) % cameraModes.length];
    this.setCamera(next);
  }

  private instrument(label: string, value: HTMLElement, unit: string): HTMLElement {
    const card = document.createElement("article");
    card.className = "instrument";
    const small = document.createElement("span");
    small.textContent = label;
    const unitEl = document.createElement("em");
    unitEl.textContent = unit;
    card.append(small, value, unitEl);
    return card;
  }

  private buildSettings(): void {
    this.settingsPanel.className = "settings-panel";
    const title = document.createElement("h2");
    title.textContent = "Flight Deck";

    const camera = segmented("Camera", cameraModes, this.settings.cameraMode, (mode) => this.setCamera(mode as CameraMode));
    const weather = segmented("Weather", weatherModes, this.settings.weather, (mode) => {
      this.settings.weather = mode as WeatherMode;
      this.onWeather?.(this.settings.weather);
    });
    const time = segmented("Time", timeModes, this.settings.time, (mode) => {
      this.settings.time = mode as TimeMode;
      this.onTime?.(this.settings.time);
    });
    const quality = segmented("Quality", ["balanced", "high"], this.settings.quality, (mode) => {
      this.settings.quality = mode as SettingsState["quality"];
      this.onQuality?.(this.settings.quality);
    });

    this.legSelect.className = "leg-select";
    this.route.allWaypoints.slice(0, -1).forEach((point, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${point.code} to ${this.route.allWaypoints[index + 1].code}`;
      this.legSelect.append(option);
    });
    this.legSelect.addEventListener("change", () => this.onJumpLeg?.(Number(this.legSelect.value)));

    const pause = document.createElement("button");
    pause.className = "primary-button";
    pause.textContent = "Resume Flight";
    pause.addEventListener("click", () => this.onPause?.());

    const row = document.createElement("label");
    row.className = "field";
    row.textContent = "Route leg";
    row.append(this.legSelect);

    this.settingsPanel.append(title, camera, weather, time, quality, row, pause);
  }

  private setCamera(mode: CameraMode): void {
    this.settings.cameraMode = mode;
    this.onCameraMode?.(mode);
    this.settingsPanel.querySelectorAll("[data-group='Camera'] button").forEach((button) => {
      button.classList.toggle("active", button.textContent?.toLowerCase() === mode);
    });
  }
}

function segmented(label: string, options: string[], active: string, onSelect: (value: string) => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "segmented-wrap";
  const title = document.createElement("span");
  title.textContent = label;
  const group = document.createElement("div");
  group.className = "segmented";
  group.dataset.group = label;
  options.forEach((option) => {
    const button = document.createElement("button");
    button.textContent = option;
    button.className = option === active ? "active" : "";
    button.addEventListener("click", () => {
      group.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      onSelect(option);
    });
    group.append(button);
  });
  wrap.append(title, group);
  return wrap;
}

function marker(className: string): HTMLElement {
  const el = document.createElement("i");
  el.className = className;
  return el;
}
