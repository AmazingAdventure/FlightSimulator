export type CameraMode = "cockpit" | "chase" | "cinematic" | "map";
export type WeatherMode = "clear" | "mist" | "storm";
export type TimeMode = "dawn" | "day" | "dusk" | "night";

export interface InputState {
  pitch: number;
  roll: number;
  yaw: number;
  throttleDelta: number;
  flapDelta: number;
  brake: boolean;
  autopilotToggle: boolean;
  cameraNext: boolean;
  pauseToggle: boolean;
  reset: boolean;
}

export interface AircraftTelemetry {
  airspeed: number;
  altitude: number;
  verticalSpeed: number;
  heading: number;
  pitch: number;
  roll: number;
  throttle: number;
  flaps: number;
  stall: boolean;
  airborne: boolean;
  autopilot: boolean;
}

export interface SettingsState {
  cameraMode: CameraMode;
  weather: WeatherMode;
  time: TimeMode;
  quality: "balanced" | "high";
  paused: boolean;
}
