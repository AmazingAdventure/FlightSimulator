import { AircraftTelemetry, CameraMode, SettingsState, SimRate, TimeMode, WeatherMode } from "../types";
import { RouteManager } from "../route/RouteManager";
import { Waypoint } from "../route/waypoints";

const cameraModes: CameraMode[] = ["cockpit", "chase", "cinematic", "map"];
const weatherModes: WeatherMode[] = ["clear", "mist", "storm"];
const timeModes: TimeMode[] = ["dawn", "day", "dusk", "night"];
const simRates: SimRate[] = [1, 2, 4, 8];

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
  private globePanel = document.createElement("section");
  private globeCanvas = document.createElement("canvas");
  private globeRouteList = document.createElement("div");
  private globeDetails = document.createElement("div");
  private legSelect = document.createElement("select");
  private globeOpen = false;
  private globeCenterLon = -98;
  private globeZoom = 1;
  private globeSelectedIndex = 0;
  private globeDragging = false;
  private globeDragStartX = 0;
  private globeDragStartLon = 0;

  onCameraMode?: (mode: CameraMode) => void;
  onThrottleNudge?: (delta: number) => void;
  onFlapsNudge?: (delta: number) => void;
  onAutopilotToggle?: () => void;
  onSimRateChange?: (rate: SimRate) => void;
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
          <span data-pill="rate">1X</span>
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
    this.controls.append(
      actionButton("Throttle -", () => this.onThrottleNudge?.(-0.08)),
      actionButton("Throttle +", () => this.onThrottleNudge?.(0.08)),
      actionButton("Flaps -", () => this.onFlapsNudge?.(-0.25)),
      actionButton("Flaps +", () => this.onFlapsNudge?.(0.25)),
      actionButton("Autopilot", () => this.onAutopilotToggle?.()),
      actionButton("FF >>", () => this.cycleSimRate()),
      actionButton("Camera", () => this.cycleCamera()),
      actionButton("Globe Map", () => this.toggleGlobeMap()),
      actionButton("Flight Deck", () => this.onPause?.())
    );

    this.buildSettings();
    this.buildGlobeMap();
    this.root.append(instruments, horizon, routePanel, this.warning, this.controls, this.settingsPanel, this.globePanel);
    document.body.append(this.root);
  }

  update(telemetry: AircraftTelemetry): void {
    const leg = this.route.currentLeg;
    this.speed.textContent = formatNumber(telemetry.airspeed);
    this.altitude.textContent = formatNumber(telemetry.altitude);
    this.vsi.textContent = formatNumber(telemetry.verticalSpeed);
    this.heading.textContent = formatNumber(telemetry.heading).padStart(3, "0");
    this.throttle.style.height = `${Math.round(finiteOr(telemetry.throttle, 0) * 100)}%`;
    this.attitude.style.transform = `rotate(${finiteOr(telemetry.roll, 0)}deg)`;
    this.pitchTape.style.transform = `translateY(${finiteOr(telemetry.pitch, 0) * 1.6}px)`;
    this.routeTitle.textContent = `${leg.from.code} ${leg.from.city} -> ${leg.to.code} ${leg.to.city}`;
    this.routeMeta.textContent = `${this.route.phase.toUpperCase()} | Leg ${this.route.displayLegNumber}/${this.route.totalLegs} | ${formatNumber(this.route.remainingKm)} km | ${formatNumber(leg.bearingDeg).padStart(3, "0")} deg`;
    this.progressFill.style.width = `${finiteOr(this.route.progressRatio, 0) * 100}%`;
    this.warning.classList.toggle("visible", telemetry.stall);
    this.root.querySelector('[data-pill="phase"]')!.textContent = this.route.phase.toUpperCase();
    this.root.querySelector('[data-pill="ap"]')!.textContent = telemetry.autopilot ? "AP ON" : "AP OFF";
    this.root.querySelector('[data-pill="rate"]')!.textContent = `${this.settings.simRate}X`;
    this.root.classList.toggle("paused", this.settings.paused);
    if (this.globeOpen) this.drawGlobeMap();
  }

  setPaused(paused: boolean): void {
    this.settings.paused = paused;
    this.settingsPanel.classList.toggle("open", paused);
  }

  cycleCamera(): void {
    const next = cameraModes[(cameraModes.indexOf(this.settings.cameraMode) + 1) % cameraModes.length];
    this.setCamera(next);
  }

  cycleSimRate(): void {
    const next = simRates[(simRates.indexOf(this.settings.simRate) + 1) % simRates.length];
    this.setSimRate(next);
  }

  toggleGlobeMap(): void {
    this.globeOpen = !this.globeOpen;
    this.globePanel.classList.toggle("open", this.globeOpen);
    if (this.globeOpen) {
      this.focusGlobeWaypoint(this.route.currentLegIndex);
    }
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
    const simRate = segmented("Fast Forward", simRates.map((rate) => `${rate}x`), `${this.settings.simRate}x`, (mode) => {
      this.setSimRate(Number.parseInt(mode, 10) as SimRate);
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

    this.settingsPanel.append(title, camera, weather, time, simRate, quality, row, pause);
  }

  private buildGlobeMap(): void {
    this.globePanel.className = "globe-panel";
    const header = document.createElement("header");
    const copy = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Route Globe";
    const title = document.createElement("h2");
    title.textContent = "Calgary to Bhubaneswar";
    copy.append(eyebrow, title);
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => this.toggleGlobeMap());
    header.append(copy, close);

    this.globeCanvas.className = "globe-canvas";
    this.globeCanvas.width = 920;
    this.globeCanvas.height = 640;
    this.globeCanvas.addEventListener("pointerdown", (event) => this.startGlobeDrag(event));
    this.globeCanvas.addEventListener("pointermove", (event) => this.moveGlobeDrag(event));
    this.globeCanvas.addEventListener("pointerup", () => this.endGlobeDrag());
    this.globeCanvas.addEventListener("pointercancel", () => this.endGlobeDrag());
    this.globeCanvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.globeZoom = clamp(this.globeZoom + (event.deltaY < 0 ? 0.08 : -0.08), 0.82, 1.34);
      this.drawGlobeMap();
    });

    this.globeDetails.className = "globe-details";
    this.globeRouteList.className = "globe-route-list";
    this.route.allWaypoints.forEach((point, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${String(index + 1).padStart(2, "0")} ${point.code} ${point.city}`;
      button.addEventListener("click", () => this.focusGlobeWaypoint(index));
      this.globeRouteList.append(button);
    });

    const body = document.createElement("div");
    body.className = "globe-body";
    const sidebar = document.createElement("aside");
    sidebar.className = "globe-sidebar";
    sidebar.append(this.globeDetails, this.globeRouteList);
    body.append(sidebar, this.globeCanvas);

    this.globePanel.append(header, body);
  }

  private setCamera(mode: CameraMode): void {
    this.settings.cameraMode = mode;
    this.onCameraMode?.(mode);
    this.settingsPanel.querySelectorAll("[data-group='Camera'] button").forEach((button) => {
      button.classList.toggle("active", button.textContent?.toLowerCase() === mode);
    });
  }

  private setSimRate(rate: SimRate): void {
    this.settings.simRate = rate;
    this.onSimRateChange?.(rate);
    this.settingsPanel.querySelectorAll("[data-group='Fast Forward'] button").forEach((button) => {
      button.classList.toggle("active", button.textContent?.toLowerCase() === `${rate}x`);
    });
  }

  private drawGlobeMap(): void {
    const rect = this.globeCanvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(360, Math.floor(rect.width * pixelRatio));
    const height = Math.max(300, Math.floor(rect.height * pixelRatio));
    if (this.globeCanvas.width !== width || this.globeCanvas.height !== height) {
      this.globeCanvas.width = width;
      this.globeCanvas.height = height;
    }

    const ctx = this.globeCanvas.getContext("2d");
    if (!ctx) return;

    const centerX = width * 0.5;
    const centerY = height * 0.49;
    const radius = Math.min(width * 0.42, height * 0.42) * this.globeZoom;
    const centerLon = this.globeCenterLon;
    const waypoints = this.route.allWaypoints;
    const currentIndex = this.route.currentLegIndex;
    const selectedPoint = waypoints[this.globeSelectedIndex] ?? waypoints[currentIndex];

    this.updateGlobeList(selectedPoint);

    ctx.clearRect(0, 0, width, height);
    this.drawStarfield(ctx, width, height, radius);
    const ocean = ctx.createRadialGradient(centerX - radius * 0.34, centerY - radius * 0.36, radius * 0.1, centerX, centerY, radius);
    ocean.addColorStop(0, "rgba(104, 198, 255, 0.95)");
    ocean.addColorStop(0.62, "rgba(35, 113, 159, 0.88)");
    ocean.addColorStop(1, "rgba(7, 27, 49, 0.96)");
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = ocean;
    ctx.fill();

    this.drawGlobeGrid(ctx, centerX, centerY, radius);
    this.drawApproxContinents(ctx, centerX, centerY, radius, centerLon);
    this.drawRoute(ctx, waypoints, centerX, centerY, radius, centerLon, false);
    this.drawRoute(ctx, waypoints, centerX, centerY, radius, centerLon, true);

    const labelRects: Array<{ x: number; y: number; width: number; height: number }> = [];
    waypoints.forEach((point, index) => {
      const projected = projectPoint(point.lat, point.lon, centerLon, centerX, centerY, radius);
      const isCurrent = index === currentIndex;
      const isSelected = index === this.globeSelectedIndex;
      const isDestination = index === waypoints.length - 1;
      const dotSize = isCurrent || isSelected ? 8 : isDestination ? 7 : 5;
      ctx.globalAlpha = projected.front ? 1 : 0.48;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, dotSize * pixelRatio, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#ffffff" : isCurrent ? "#fff36d" : point.accent;
      ctx.fill();
      ctx.lineWidth = 1.5 * pixelRatio;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
      ctx.stroke();

      if (!projected.front && !isSelected) return;

      ctx.font = `${Math.round(11 * pixelRatio)}px Inter, system-ui, sans-serif`;
      const label = `${index + 1}. ${point.code}`;
      const metrics = ctx.measureText(label);
      const labelWidth = metrics.width + 12 * pixelRatio;
      const labelHeight = 18 * pixelRatio;
      const labelX = projected.x + (projected.x > centerX ? 12 : -12) * pixelRatio;
      const labelY = projected.y + (index % 2 === 0 ? -16 : 18) * pixelRatio;
      const rect = {
        x: projected.x > centerX ? labelX : labelX - labelWidth,
        y: labelY - labelHeight * 0.5,
        width: labelWidth,
        height: labelHeight
      };
      const collides = labelRects.some((item) => intersects(item, rect));
      if (collides && !isSelected && !isCurrent) return;
      labelRects.push(rect);

      ctx.fillStyle = "rgba(4, 13, 20, 0.68)";
      roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 7 * pixelRatio);
      ctx.fill();
      ctx.fillStyle = "rgba(246, 251, 255, 0.96)";
      ctx.textAlign = projected.x > centerX ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillText(label, labelX, labelY);
    });
    ctx.globalAlpha = 1;

    const rim = ctx.createRadialGradient(centerX, centerY, radius * 0.75, centerX, centerY, radius * 1.03);
    rim.addColorStop(0, "rgba(255, 255, 255, 0)");
    rim.addColorStop(1, "rgba(255, 255, 255, 0.48)");
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 5 * pixelRatio;
    ctx.stroke();
  }

  private startGlobeDrag(event: PointerEvent): void {
    this.globeDragging = true;
    this.globeDragStartX = event.clientX;
    this.globeDragStartLon = this.globeCenterLon;
    this.globeCanvas.setPointerCapture(event.pointerId);
  }

  private moveGlobeDrag(event: PointerEvent): void {
    if (!this.globeDragging) return;
    const deltaX = event.clientX - this.globeDragStartX;
    this.globeCenterLon = normalizeLon(this.globeDragStartLon - deltaX * 0.42);
    this.drawGlobeMap();
  }

  private endGlobeDrag(): void {
    this.globeDragging = false;
  }

  private focusGlobeWaypoint(index: number): void {
    const waypoint = this.route.allWaypoints[index] ?? this.route.allWaypoints[0];
    this.globeSelectedIndex = index;
    this.globeCenterLon = waypoint.lon;
    this.drawGlobeMap();
  }

  private updateGlobeList(selectedPoint: Waypoint): void {
    this.globeDetails.innerHTML = `
      <span>${String(this.globeSelectedIndex + 1).padStart(2, "0")} / ${this.route.allWaypoints.length}</span>
      <strong>${selectedPoint.code} ${selectedPoint.city}</strong>
      <em>${selectedPoint.airport}</em>
    `;
    Array.from(this.globeRouteList.children).forEach((item, index) => {
      item.classList.toggle("active", index === this.globeSelectedIndex);
      item.classList.toggle("current", index === this.route.currentLegIndex);
    });
  }

  private drawStarfield(ctx: CanvasRenderingContext2D, width: number, height: number, radius: number): void {
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    for (let i = 0; i < 90; i++) {
      const x = (Math.sin(i * 73.13) * 0.5 + 0.5) * width;
      const y = (Math.cos(i * 41.77) * 0.5 + 0.5) * height;
      const size = (i % 5 === 0 ? 1.4 : 0.8) * Math.max(1, radius / 260);
      ctx.globalAlpha = 0.16 + (i % 7) * 0.035;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGlobeGrid(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(231, 246, 255, 0.18)";
    ctx.lineWidth = Math.max(1, radius * 0.004);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * Math.cos(i * 0.25), radius * 0.18 + Math.abs(i) * radius * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * 0.16 + Math.abs(i) * radius * 0.12, radius, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawApproxContinents(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, centerLon: number): void {
    const landSets = [
      [
        { lat: 62, lon: -126 },
        { lat: 54, lon: -98 },
        { lat: 43, lon: -74 },
        { lat: 29, lon: -82 },
        { lat: 18, lon: -95 },
        { lat: 35, lon: -118 }
      ],
      [
        { lat: 58, lon: -9 },
        { lat: 56, lon: 14 },
        { lat: 46, lon: 31 },
        { lat: 31, lon: 50 },
        { lat: 13, lon: 78 },
        { lat: 21, lon: 86 },
        { lat: 42, lon: 45 },
        { lat: 52, lon: 5 }
      ],
      [
        { lat: 31, lon: 34 },
        { lat: 22, lon: 57 },
        { lat: 9, lon: 47 },
        { lat: 1, lon: 32 },
        { lat: 16, lon: 20 }
      ]
    ];

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    landSets.forEach((shape) => {
      ctx.beginPath();
      shape.forEach((point, index) => {
        const projected = projectPoint(point.lat, point.lon, centerLon, cx, cy, radius);
        if (index === 0) ctx.moveTo(projected.x, projected.y);
        else ctx.lineTo(projected.x, projected.y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(88, 151, 99, 0.6)";
      ctx.fill();
      ctx.strokeStyle = "rgba(211, 231, 183, 0.35)";
      ctx.lineWidth = Math.max(1, radius * 0.006);
      ctx.stroke();
    });
    ctx.restore();
  }

  private drawRoute(ctx: CanvasRenderingContext2D, waypoints: Waypoint[], cx: number, cy: number, radius: number, centerLon: number, front: boolean): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineWidth = Math.max(2, radius * (front ? 0.012 : 0.008));
    ctx.strokeStyle = front ? "rgba(255, 237, 124, 0.96)" : "rgba(255, 255, 255, 0.28)";
    ctx.setLineDash(front ? [] : [radius * 0.026, radius * 0.02]);

    for (let i = 0; i < waypoints.length - 1; i++) {
      const samples = sampleLeg(waypoints[i], waypoints[i + 1], 28);
      ctx.beginPath();
      let started = false;
      samples.forEach((point) => {
        const projected = projectPoint(point.lat, point.lon, centerLon, cx, cy, radius);
        if (projected.front !== front) {
          started = false;
          return;
        }
        if (!started) {
          ctx.moveTo(projected.x, projected.y);
          started = true;
        } else {
          ctx.lineTo(projected.x, projected.y);
        }
      });
      ctx.stroke();
    }
    ctx.restore();
  }
}

function actionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
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

function formatNumber(value: number): string {
  return finiteOr(value, 0).toFixed(0);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function projectPoint(lat: number, lon: number, centerLon: number, cx: number, cy: number, radius: number) {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = ((lon - centerLon) * Math.PI) / 180;
  const x = cx + radius * Math.cos(latRad) * Math.sin(lonRad);
  const y = cy - radius * Math.sin(latRad);
  const z = Math.cos(latRad) * Math.cos(lonRad);
  return { x, y, front: z >= 0 };
}

function sampleLeg(from: Waypoint, to: Waypoint, count: number): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  let deltaLon = to.lon - from.lon;
  if (deltaLon > 180) deltaLon -= 360;
  if (deltaLon < -180) deltaLon += 360;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lon: normalizeLon(from.lon + deltaLon * t)
    });
  }
  return points;
}

function normalizeLon(lon: number): number {
  if (lon > 180) return lon - 360;
  if (lon < -180) return lon + 360;
  return lon;
}
