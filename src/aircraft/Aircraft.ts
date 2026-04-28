import * as THREE from "three";
import { AircraftTelemetry, InputState } from "../types";

const MAX_SPEED = 92;
const MIN_FLYING_SPEED = 23;
const STALL_SPEED = 18;
const GRAVITY = 9.81;

export class Aircraft {
  readonly group = new THREE.Group();
  readonly velocity = new THREE.Vector3(0, 0, -8);
  readonly angular = new THREE.Vector3();
  throttle = 0.62;
  flaps = 0;
  autopilot = false;
  airborne = false;
  stall = false;

  private telemetry: AircraftTelemetry = {
    airspeed: 0,
    altitude: 0,
    verticalSpeed: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    throttle: this.throttle,
    flaps: this.flaps,
    stall: false,
    airborne: false,
    autopilot: false
  };

  constructor() {
    this.group.name = "Cessna 172";
    this.group.position.set(0, 1.4, 250);
    this.buildModel();
  }

  reset(position = new THREE.Vector3(0, 1.4, 250)): void {
    this.group.position.copy(position);
    this.group.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, -8);
    this.angular.set(0, 0, 0);
    this.throttle = 0.62;
    this.flaps = 0;
    this.autopilot = false;
    this.airborne = false;
    this.stall = false;
  }

  update(dt: number, input: InputState, target?: THREE.Vector3): void {
    if (input.autopilotToggle) this.autopilot = !this.autopilot;
    if (input.flapDelta !== 0) this.flaps = THREE.MathUtils.clamp(this.flaps + input.flapDelta * 0.25, 0, 1);

    this.throttle = THREE.MathUtils.clamp(this.throttle + input.throttleDelta * dt * 0.34, 0, 1);
    if (input.brake && !this.airborne) this.throttle = Math.max(0, this.throttle - dt * 0.55);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
    const speed = this.velocity.length();
    const auto = this.autopilot && target ? this.autopilotInput(target, speed) : { pitch: input.pitch, roll: input.roll, yaw: input.yaw };

    const targetPitchRate = auto.pitch * 0.42;
    const targetRollRate = -auto.roll * 0.86;
    const targetYawRate = -auto.yaw * 0.26;

    this.angular.x = THREE.MathUtils.lerp(this.angular.x, targetPitchRate, dt * 2.8);
    this.angular.z = THREE.MathUtils.lerp(this.angular.z, targetRollRate, dt * 3.2);
    this.angular.y = THREE.MathUtils.lerp(this.angular.y, targetYawRate, dt * 2.4);

    this.group.rotation.x += this.angular.x * dt;
    this.group.rotation.z += this.angular.z * dt;
    this.group.rotation.y += this.angular.y * dt + Math.sin(-this.group.rotation.z) * dt * 0.22;
    this.group.rotation.x = THREE.MathUtils.clamp(this.group.rotation.x, -0.55, 0.45);
    this.group.rotation.z = THREE.MathUtils.clamp(this.group.rotation.z, -0.95, 0.95);

    const desiredSpeed = 11 + this.throttle * MAX_SPEED - this.flaps * 10;
    const drag = 0.012 + this.flaps * 0.018 + Math.abs(this.group.rotation.z) * 0.006;
    const accel = (desiredSpeed - speed) * 0.36 - speed * speed * drag * 0.002;
    this.velocity.addScaledVector(forward, accel * dt);

    const liftFactor = THREE.MathUtils.clamp(speed / MIN_FLYING_SPEED, 0, 1.45);
    const pitchLift = Math.sin(this.group.rotation.x) * 16;
    const flapLift = this.flaps * 5.5;
    const lift = (liftFactor * liftFactor * (GRAVITY + pitchLift + flapLift)) - GRAVITY;
    this.velocity.y += lift * dt;

    if (!this.airborne && speed > MIN_FLYING_SPEED && this.group.rotation.x > 0.04) {
      this.airborne = true;
      this.velocity.y = Math.max(this.velocity.y, 2.6);
    }

    this.stall = this.airborne && speed < STALL_SPEED && this.group.position.y > 12;
    if (this.stall) {
      this.velocity.y -= 10.5 * dt;
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, -0.18, dt * 1.8);
    }

    this.velocity.multiplyScalar(1 - dt * 0.015);
    this.velocity.y = THREE.MathUtils.clamp(this.velocity.y, -36, 28);
    this.group.position.addScaledVector(this.velocity, dt);

    if (this.group.position.y <= 1.4) {
      this.group.position.y = 1.4;
      this.velocity.y = Math.max(0, this.velocity.y);
      this.airborne = speed > 31;
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, dt * 4);
      this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, 0, dt * 5);
      if (input.brake) this.velocity.multiplyScalar(1 - dt * 1.3);
    }

    let telemetrySpeed = speed;
    if (!this.hasFiniteState()) {
      this.reset();
      telemetrySpeed = this.velocity.length();
    }

    this.updateTelemetry(telemetrySpeed);
  }

  getTelemetry(): AircraftTelemetry {
    return this.telemetry;
  }

  getCockpitCameraAnchor(): THREE.Vector3 {
    return new THREE.Vector3(0, 1.05, -1.1).applyMatrix4(this.group.matrixWorld);
  }

  private autopilotInput(target: THREE.Vector3, speed: number) {
    const toTarget = target.clone().sub(this.group.position);
    const desiredHeading = Math.atan2(-toTarget.x, -toTarget.z);
    const headingError = wrapAngle(desiredHeading - this.group.rotation.y);
    const desiredAltitude = this.group.position.z < -6200 ? 230 : 620;
    const altitudeError = THREE.MathUtils.clamp((desiredAltitude - this.group.position.y) / 500, -0.7, 0.7);

    this.throttle = THREE.MathUtils.lerp(this.throttle, speed < 55 ? 0.88 : 0.68, 0.012);

    return {
      pitch: THREE.MathUtils.clamp(-altitudeError - this.velocity.y * 0.02, -0.45, 0.45),
      roll: THREE.MathUtils.clamp(headingError * 1.2, -0.55, 0.55),
      yaw: THREE.MathUtils.clamp(headingError * 0.4, -0.35, 0.35)
    };
  }

  private updateTelemetry(speed: number): void {
    this.telemetry = {
      airspeed: speed * 1.94384,
      altitude: Math.max(0, this.group.position.y * 3.28084),
      verticalSpeed: this.velocity.y * 196.85,
      heading: ((THREE.MathUtils.radToDeg(this.group.rotation.y) % 360) + 360) % 360,
      pitch: THREE.MathUtils.radToDeg(this.group.rotation.x),
      roll: THREE.MathUtils.radToDeg(-this.group.rotation.z),
      throttle: this.throttle,
      flaps: this.flaps,
      stall: this.stall,
      airborne: this.airborne,
      autopilot: this.autopilot
    };
  }

  private buildModel(): void {
    const paint = new THREE.MeshStandardMaterial({ color: "#f6f8f4", metalness: 0.28, roughness: 0.34 });
    const blue = new THREE.MeshStandardMaterial({ color: "#2267c8", metalness: 0.18, roughness: 0.42 });
    const glass = new THREE.MeshPhysicalMaterial({ color: "#9fd7ff", transmission: 0.35, opacity: 0.6, transparent: true, roughness: 0.03 });
    const dark = new THREE.MeshStandardMaterial({ color: "#1a2026", roughness: 0.55 });

    const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 3.8, 8, 18), paint);
    fuselage.rotation.x = Math.PI / 2;
    this.group.add(fuselage);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 2.7), blue);
    stripe.position.set(0, -0.05, 0.05);
    this.group.add(stripe);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.52, 0.9), glass);
    cabin.position.set(0, 0.32, -0.35);
    cabin.rotation.x = -0.07;
    this.group.add(cabin);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.08, 0.82), paint);
    wing.position.set(0, 0.28, -0.42);
    this.group.add(wing);

    const leftStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8), paint);
    leftStrut.position.set(-1.8, -0.22, -0.25);
    leftStrut.rotation.z = -0.58;
    this.group.add(leftStrut);

    const rightStrut = leftStrut.clone();
    rightStrut.position.x = 1.8;
    rightStrut.rotation.z = 0.58;
    this.group.add(rightStrut);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.52), paint);
    tail.position.set(0, 0.12, 1.82);
    this.group.add(tail);

    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.55), paint);
    rudder.position.set(0, 0.55, 1.95);
    rudder.rotation.x = -0.24;
    this.group.add(rudder);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.7, 18), paint);
    nose.position.z = -2.25;
    nose.rotation.x = -Math.PI / 2;
    this.group.add(nose);

    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.48, 0.035), dark);
    prop.position.set(0, 0, -2.66);
    this.group.add(prop);

    const gearMat = new THREE.MeshStandardMaterial({ color: "#262626", roughness: 0.5 });
    for (const x of [-0.46, 0.46]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 18), gearMat);
      wheel.position.set(x, -0.48, -0.82);
      wheel.rotation.y = Math.PI / 2;
      this.group.add(wheel);
    }
    const noseWheel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 18), gearMat);
    noseWheel.position.set(0, -0.46, -1.86);
    noseWheel.rotation.y = Math.PI / 2;
    this.group.add(noseWheel);
  }

  private hasFiniteState(): boolean {
    return (
      Number.isFinite(this.group.position.x) &&
      Number.isFinite(this.group.position.y) &&
      Number.isFinite(this.group.position.z) &&
      Number.isFinite(this.group.rotation.x) &&
      Number.isFinite(this.group.rotation.y) &&
      Number.isFinite(this.group.rotation.z) &&
      Number.isFinite(this.velocity.x) &&
      Number.isFinite(this.velocity.y) &&
      Number.isFinite(this.velocity.z) &&
      Number.isFinite(this.throttle) &&
      Number.isFinite(this.flaps)
    );
  }
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
