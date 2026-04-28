import { InputState } from "../types";

const emptyInput = (): InputState => ({
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttleDelta: 0,
  flapDelta: 0,
  brake: false,
  autopilotToggle: false,
  cameraNext: false,
  pauseToggle: false,
  reset: false
});

export class InputManager {
  private keys = new Set<string>();
  private oneShot = emptyInput();

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  sample(): InputState {
    const state = emptyInput();
    state.pitch = Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) - Number(this.keys.has("KeyW") || this.keys.has("ArrowUp"));
    state.roll = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    state.yaw = Number(this.keys.has("KeyE")) - Number(this.keys.has("KeyQ"));
    state.throttleDelta = Number(this.keys.has("Equal") || this.keys.has("NumpadAdd")) - Number(this.keys.has("Minus") || this.keys.has("NumpadSubtract"));
    state.flapDelta = this.oneShot.flapDelta;
    state.brake = this.keys.has("Space");
    state.autopilotToggle = this.oneShot.autopilotToggle;
    state.cameraNext = this.oneShot.cameraNext;
    state.pauseToggle = this.oneShot.pauseToggle;
    state.reset = this.oneShot.reset;

    const gamepad = navigator.getGamepads?.()[0];
    if (gamepad) {
      state.roll += Math.abs(gamepad.axes[0]) > 0.08 ? gamepad.axes[0] : 0;
      state.pitch += Math.abs(gamepad.axes[1]) > 0.08 ? gamepad.axes[1] : 0;
      state.yaw += (gamepad.buttons[5]?.value ?? 0) - (gamepad.buttons[4]?.value ?? 0);
      state.throttleDelta += (gamepad.buttons[7]?.value ?? 0) - (gamepad.buttons[6]?.value ?? 0);
      state.brake ||= Boolean(gamepad.buttons[0]?.pressed);
    }

    this.oneShot = emptyInput();
    return {
      ...state,
      pitch: clampAxis(state.pitch),
      roll: clampAxis(state.roll),
      yaw: clampAxis(state.yaw),
      throttleDelta: clampAxis(state.throttleDelta)
    };
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }

    if (!this.keys.has(event.code)) {
      if (event.code === "KeyF") this.oneShot.flapDelta = event.shiftKey ? -1 : 1;
      if (event.code === "KeyP") this.oneShot.autopilotToggle = true;
      if (event.code === "KeyC") this.oneShot.cameraNext = true;
      if (event.code === "Escape") this.oneShot.pauseToggle = true;
      if (event.code === "KeyR") this.oneShot.reset = true;
    }

    this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };
}

function clampAxis(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
