import * as THREE from "three";
import { Aircraft } from "../aircraft/Aircraft";
import { RouteManager } from "../route/RouteManager";
import { CameraMode, SettingsState, TimeMode, WeatherMode } from "../types";

export class FlightScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 26000);
  readonly renderer: THREE.WebGLRenderer;

  private sun = new THREE.DirectionalLight("#fff4d1", 3);
  private moon = new THREE.DirectionalLight("#93b5ff", 0);
  private ambient = new THREE.HemisphereLight("#a9d7ff", "#4c4b39", 1.2);
  private terrain = new THREE.Group();
  private airport = new THREE.Group();
  private clouds = new THREE.Group();
  private cityLights = new THREE.Group();
  private waypointMarker = new THREE.Group();
  private cameraVelocity = new THREE.Vector3();
  private cinematicAngle = 0;

  constructor(private canvasHost: HTMLElement, private route: RouteManager) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.canvasHost.appendChild(this.renderer.domElement);

    this.scene.add(this.ambient, this.sun, this.moon, this.terrain, this.airport, this.clouds, this.cityLights, this.waypointMarker);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 7000;
    this.sun.shadow.camera.left = -3000;
    this.sun.shadow.camera.right = 3000;
    this.sun.shadow.camera.top = 3000;
    this.sun.shadow.camera.bottom = -3000;

    this.buildTerrain();
    this.buildClouds();
    this.rebuildAirports();
    this.buildWaypointMarker();
    window.addEventListener("resize", this.resize);
    this.resize();
  }

  dispose(): void {
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
  }

  addAircraft(aircraft: Aircraft): void {
    this.scene.add(aircraft.group);
  }

  update(dt: number, aircraft: Aircraft, settings: SettingsState): void {
    this.clouds.children.forEach((cloud, index) => {
      cloud.position.x += Math.sin(performance.now() * 0.00008 + index) * dt * 5;
      cloud.position.z += dt * (2 + index * 0.04);
      if (cloud.position.z > aircraft.group.position.z + 1800) cloud.position.z -= 8600;
    });

    this.cityLights.visible = settings.time === "night" || settings.time === "dusk";
    this.waypointMarker.position.copy(this.route.getAirportPosition("to")).add(new THREE.Vector3(0, 120, 0));
    this.waypointMarker.rotation.y += dt * 0.7;

    this.applyAtmosphere(settings.weather, settings.time);
    this.updateCamera(dt, aircraft, settings.cameraMode);
    this.renderer.render(this.scene, this.camera);
  }

  rebuildAirports(): void {
    this.airport.clear();
    this.cityLights.clear();
    this.createAirport(this.route.getAirportPosition("from"), this.route.currentLeg.from.city, this.route.currentLeg.from.accent, 0);
    this.createAirport(this.route.getAirportPosition("to"), this.route.currentLeg.to.city, this.route.currentLeg.to.accent, Math.PI);
  }

  private updateCamera(dt: number, aircraft: Aircraft, mode: CameraMode): void {
    const target = new THREE.Vector3();
    const desired = new THREE.Vector3();
    const aircraftPos = aircraft.group.position;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.group.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(aircraft.group.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aircraft.group.quaternion);

    if (mode === "cockpit") {
      desired.copy(aircraft.getCockpitCameraAnchor());
      target.copy(aircraftPos).addScaledVector(forward, 80).addScaledVector(up, 8);
    } else if (mode === "map") {
      desired.set(0, 4300, aircraftPos.z + 900);
      target.set(0, 0, aircraftPos.z - 2100);
    } else if (mode === "cinematic") {
      this.cinematicAngle += dt * 0.18;
      desired.copy(aircraftPos)
        .addScaledVector(right, Math.sin(this.cinematicAngle) * 22)
        .addScaledVector(forward, -26 + Math.cos(this.cinematicAngle) * 16)
        .add(new THREE.Vector3(0, 8 + Math.sin(this.cinematicAngle * 0.7) * 4, 0));
      target.copy(aircraftPos).addScaledVector(forward, 30);
    } else {
      desired.copy(aircraftPos).addScaledVector(forward, -32).add(new THREE.Vector3(0, 9, 0));
      target.copy(aircraftPos).addScaledVector(forward, 22).add(new THREE.Vector3(0, 3, 0));
    }

    this.camera.position.smoothDamp(desired, this.cameraVelocity, mode === "cockpit" ? 0.06 : 0.18, Infinity, dt);
    this.camera.lookAt(target);
  }

  private applyAtmosphere(weather: WeatherMode, time: TimeMode): void {
    const palette: Record<TimeMode, { sky: string; fog: string; sun: number; moon: number; ambient: number; sunPos: THREE.Vector3 }> = {
      dawn: { sky: "#9fc4dc", fog: "#ffc9a3", sun: 2.2, moon: 0.1, ambient: 1.1, sunPos: new THREE.Vector3(-900, 650, 900) },
      day: { sky: "#78b8ef", fog: "#b9d8ef", sun: 3.1, moon: 0, ambient: 1.25, sunPos: new THREE.Vector3(-1200, 1600, 800) },
      dusk: { sky: "#604c82", fog: "#ff9d76", sun: 1.4, moon: 0.25, ambient: 0.74, sunPos: new THREE.Vector3(1100, 420, 700) },
      night: { sky: "#07101e", fog: "#10182b", sun: 0.1, moon: 0.9, ambient: 0.32, sunPos: new THREE.Vector3(-900, 120, 500) }
    };
    const p = palette[time];
    const fogDensity = weather === "storm" ? 0.00048 : weather === "mist" ? 0.00031 : 0.00012;
    this.scene.background = new THREE.Color(p.sky);
    this.scene.fog = new THREE.FogExp2(p.fog, fogDensity);
    this.sun.position.copy(p.sunPos);
    this.sun.intensity = p.sun * (weather === "storm" ? 0.55 : 1);
    this.moon.position.set(700, 1200, -400);
    this.moon.intensity = p.moon;
    this.ambient.intensity = p.ambient * (weather === "storm" ? 0.75 : 1);
  }

  private buildTerrain(): void {
    const groundMat = new THREE.MeshStandardMaterial({ color: "#4f7c51", roughness: 0.92 });
    const oceanMat = new THREE.MeshStandardMaterial({ color: "#1f6d8d", metalness: 0.12, roughness: 0.5 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(15000, 19000, 80, 120), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -3900;
    ground.receiveShadow = true;
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const h = Math.sin(x * 0.003) * 22 + Math.cos(y * 0.0024) * 28 + Math.sin((x + y) * 0.0012) * 18;
      pos.setZ(i, h);
    }
    ground.geometry.computeVertexNormals();
    this.terrain.add(ground);

    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(8000, 19000, 1, 1), oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(-7200, -7, -3900);
    this.terrain.add(ocean);

    const mountainMat = new THREE.MeshStandardMaterial({ color: "#66735f", roughness: 0.86 });
    for (let i = 0; i < 42; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(180 + Math.random() * 220, 220 + Math.random() * 620, 5), mountainMat);
      cone.position.set(-2600 + Math.random() * 5400, 70, -9500 + Math.random() * 9000);
      cone.rotation.y = Math.random() * Math.PI;
      cone.castShadow = true;
      this.terrain.add(cone);
    }
  }

  private buildClouds(): void {
    const mat = new THREE.MeshStandardMaterial({ color: "#f9fbff", transparent: true, opacity: 0.72, roughness: 0.9 });
    for (let i = 0; i < 60; i++) {
      const cloud = new THREE.Group();
      const puffCount = 3 + Math.floor(Math.random() * 5);
      for (let p = 0; p < puffCount; p++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(38 + Math.random() * 60, 14, 10), mat);
        puff.scale.set(1.8 + Math.random() * 1.8, 0.42 + Math.random() * 0.4, 0.8 + Math.random());
        puff.position.set((Math.random() - 0.5) * 170, (Math.random() - 0.5) * 28, (Math.random() - 0.5) * 60);
        cloud.add(puff);
      }
      cloud.position.set(-3400 + Math.random() * 6800, 360 + Math.random() * 1250, 500 - Math.random() * 9000);
      this.clouds.add(cloud);
    }
  }

  private createAirport(position: THREE.Vector3, city: string, accent: string, rotationY: number): void {
    const root = new THREE.Group();
    root.position.copy(position);
    root.rotation.y = rotationY;

    const asphalt = new THREE.MeshStandardMaterial({ color: "#2d3132", roughness: 0.8 });
    const runway = new THREE.Mesh(new THREE.BoxGeometry(90, 0.08, 1500), asphalt);
    runway.receiveShadow = true;
    runway.position.y = 0.03;
    root.add(runway);

    const markMat = new THREE.MeshBasicMaterial({ color: "#f7f7eb" });
    for (let i = 0; i < 14; i++) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 54), markMat);
      mark.position.set(0, 0.11, -620 + i * 95);
      root.add(mark);
    }

    const apronMat = new THREE.MeshStandardMaterial({ color: "#565d5d", roughness: 0.82 });
    const apron = new THREE.Mesh(new THREE.BoxGeometry(520, 0.05, 360), apronMat);
    apron.position.set(310, 0.04, -210);
    root.add(apron);

    const terminalMat = new THREE.MeshStandardMaterial({ color: "#c8d4d8", roughness: 0.38, metalness: 0.14 });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(70, 24 + i * 4, 48), terminalMat);
      b.position.set(170 + i * 70, 12 + i * 2, -270 + Math.sin(i) * 60);
      b.castShadow = true;
      root.add(b);
    }

    const lightMat = new THREE.MeshBasicMaterial({ color: accent });
    for (let i = 0; i < 36; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const light = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), lightMat);
      light.position.set(side * 56, 2.4, -700 + Math.floor(i / 2) * 82);
      root.add(light);
    }

    const labelSprite = makeLabel(city, accent);
    labelSprite.position.set(0, 120, -820);
    root.add(labelSprite);

    this.airport.add(root);

    const cityMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.72 });
    for (let i = 0; i < 90; i++) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), cityMat);
      light.position.set(position.x + 700 + Math.random() * 1700, 3, position.z - 1200 + Math.random() * 2300);
      this.cityLights.add(light);
    }
  }

  private buildWaypointMarker(): void {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(90, 3, 12, 80),
      new THREE.MeshBasicMaterial({ color: "#fff6a7", transparent: true, opacity: 0.82 })
    );
    ring.rotation.x = Math.PI / 2;
    this.waypointMarker.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 22, 420, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: "#fff6a7", transparent: true, opacity: 0.14, side: THREE.DoubleSide })
    );
    this.waypointMarker.add(beam);
  }

  private resize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}

function makeLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(8, 15, 22, 0.66)";
  roundRect(ctx, 12, 28, 744, 104, 18);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#f9fbff";
  ctx.font = "600 46px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 384, 82);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(520, 108, 1);
  return sprite;
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

declare module "three" {
  interface Vector3 {
    smoothDamp(target: THREE.Vector3, velocity: THREE.Vector3, smoothTime: number, maxSpeed: number, deltaTime: number): this;
  }
}

THREE.Vector3.prototype.smoothDamp = function smoothDamp(target, velocity, smoothTime, maxSpeed, deltaTime) {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = this.clone().sub(target);
  const originalTo = target.clone();
  const maxChange = maxSpeed * smoothTime;
  if (change.lengthSq() > maxChange * maxChange) change.setLength(maxChange);
  target = this.clone().sub(change);
  const temp = velocity.clone().addScaledVector(change, omega).multiplyScalar(deltaTime);
  velocity.sub(temp.clone().multiplyScalar(omega)).multiplyScalar(exp);
  this.copy(target).add(change.add(temp).multiplyScalar(exp));
  if (originalTo.clone().sub(this).dot(target.clone().sub(originalTo)) > 0) {
    this.copy(originalTo);
    velocity.copy(this.clone().sub(originalTo)).divideScalar(deltaTime);
  }
  return this;
};
