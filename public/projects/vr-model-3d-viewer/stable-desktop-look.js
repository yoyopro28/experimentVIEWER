(function () {
  "use strict";

  if (!window.AFRAME || AFRAME.components["stable-desktop-look"]) return;

  const DEG_TO_RAD = Math.PI / 180;

  AFRAME.registerComponent("stable-desktop-look", {
    schema: {
      yawTarget: { type: "selector" },
      pitchTarget: { type: "selector" },
      controller: { type: "selector" },
      sensitivity: { default: 0.11 },
      mouseSmoothing: { default: 28 },
      maxDelta: { default: 80 },
      pitchMin: { default: -80 },
      pitchMax: { default: 80 },
      pointerLockEnabled: { default: true },
      stickTurnSpeed: { default: 110 },
      stickPitchSpeed: { default: 50 },
      stickDeadzone: { default: 0.08 },
      stickCurve: { default: 1.4 },
      stickPitchEnabled: { default: false },
    },

    init: function () {
      this.canvas = null;
      this.controllerEl = null;
      this.dragging = false;
      this.mouseButtonHeld = false;
      this.waitingForPointerLock = false;
      this.previousX = 0;
      this.previousY = 0;
      this.pendingMouseX = 0;
      this.pendingMouseY = 0;
      this.smoothedMouseX = 0;
      this.smoothedMouseY = 0;
      this.axisX = 0;
      this.axisY = 0;

      this.attachCanvas = this.attachCanvas.bind(this);
      this.bindController = this.bindController.bind(this);
      this.onControllerMove = this.onControllerMove.bind(this);
      this.onMouseDown = this.onMouseDown.bind(this);
      this.onMouseMove = this.onMouseMove.bind(this);
      this.onMouseUp = this.onMouseUp.bind(this);
      this.onPointerLockChange = this.onPointerLockChange.bind(this);
      this.onPointerLockError = this.onPointerLockError.bind(this);
      this.onEnterVR = this.onEnterVR.bind(this);
      this.onExitVR = this.onExitVR.bind(this);
      this.onWindowBlur = this.onWindowBlur.bind(this);
      this.onVisibilityChange = this.onVisibilityChange.bind(this);

      this.el.sceneEl.addEventListener(
        "render-target-loaded",
        this.attachCanvas,
      );
      this.el.sceneEl.addEventListener("loaded", this.bindController);
      this.el.sceneEl.addEventListener("enter-vr", this.onEnterVR);
      this.el.sceneEl.addEventListener("exit-vr", this.onExitVR);
      window.addEventListener("mousemove", this.onMouseMove, false);
      window.addEventListener("mouseup", this.onMouseUp, false);
      window.addEventListener("blur", this.onWindowBlur, false);
      document.addEventListener(
        "pointerlockchange",
        this.onPointerLockChange,
        false,
      );
      document.addEventListener(
        "mozpointerlockchange",
        this.onPointerLockChange,
        false,
      );
      document.addEventListener(
        "pointerlockerror",
        this.onPointerLockError,
        false,
      );
      document.addEventListener(
        "visibilitychange",
        this.onVisibilityChange,
        false,
      );

      this.attachCanvas();
      this.bindController();
    },

    update: function (oldData) {
      if (oldData.controller !== this.data.controller) {
        this.bindController();
      }
    },

    attachCanvas: function () {
      const nextCanvas = this.el.sceneEl.canvas;
      if (!nextCanvas || nextCanvas === this.canvas) return;

      if (this.canvas) {
        this.canvas.removeEventListener(
          "mousedown",
          this.onMouseDown,
          false,
        );
      }

      this.canvas = nextCanvas;
      this.canvas.addEventListener("mousedown", this.onMouseDown, false);
    },

    bindController: function () {
      const nextController =
        this.data.controller || document.querySelector("#ctlR");
      if (nextController === this.controllerEl) return;

      if (this.controllerEl) {
        this.controllerEl.removeEventListener(
          "thumbstickmoved",
          this.onControllerMove,
        );
        this.controllerEl.removeEventListener(
          "axismove",
          this.onControllerMove,
        );
      }

      this.controllerEl = nextController;
      if (this.controllerEl) {
        this.controllerEl.addEventListener(
          "thumbstickmoved",
          this.onControllerMove,
        );
        this.controllerEl.addEventListener(
          "axismove",
          this.onControllerMove,
        );
      }
    },

    onControllerMove: function (event) {
      if (!event?.detail) return;

      if (
        typeof event.detail.x === "number" &&
        typeof event.detail.y === "number"
      ) {
        this.axisX = event.detail.x;
        this.axisY = event.detail.y;
        return;
      }

      if (Array.isArray(event.detail.axis)) {
        this.axisX = event.detail.axis[0] || 0;
        this.axisY = event.detail.axis[1] || 0;
      }
    },

    isImmersive: function () {
      return this.el.sceneEl.is("vr-mode") || this.el.sceneEl.is("ar-mode");
    },

    isPointerLocked: function () {
      return (
        document.pointerLockElement === this.canvas ||
        document.mozPointerLockElement === this.canvas
      );
    },

    resetMouseMotion: function () {
      this.pendingMouseX = 0;
      this.pendingMouseY = 0;
      this.smoothedMouseX = 0;
      this.smoothedMouseY = 0;
    },

    resetAllInput: function () {
      this.dragging = false;
      this.mouseButtonHeld = false;
      this.waitingForPointerLock = false;
      this.axisX = 0;
      this.axisY = 0;
      this.resetMouseMotion();
    },

    onMouseDown: function (event) {
      if (event.button !== 0 || this.isImmersive()) return;

      this.mouseButtonHeld = true;
      this.previousX = event.clientX;
      this.previousY = event.clientY;
      this.resetMouseMotion();

      if (
        this.data.pointerLockEnabled &&
        this.canvas &&
        !this.isPointerLocked()
      ) {
        const requestPointerLock =
          this.canvas.requestPointerLock ||
          this.canvas.mozRequestPointerLock;

        if (requestPointerLock) {
          this.waitingForPointerLock = true;
          try {
            const result = requestPointerLock.call(this.canvas);
            if (result?.catch) {
              result.catch(() => this.onPointerLockError());
            }
            return;
          } catch (_error) {
            this.onPointerLockError();
          }
        }
      }

      this.dragging = true;
    },

    onMouseMove: function (event) {
      if (!this.canvas || this.isImmersive()) return;

      const pointerLocked = this.isPointerLocked();
      if (this.waitingForPointerLock && !pointerLocked) return;
      if (!pointerLocked && !this.dragging) return;

      let deltaX;
      let deltaY;

      if (pointerLocked) {
        deltaX = event.movementX || event.mozMovementX || 0;
        deltaY = event.movementY || event.mozMovementY || 0;
      } else {
        deltaX = event.clientX - this.previousX;
        deltaY = event.clientY - this.previousY;
        this.previousX = event.clientX;
        this.previousY = event.clientY;
      }

      if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;

      const maxDelta = this.data.maxDelta;
      deltaX = Math.max(-maxDelta, Math.min(maxDelta, deltaX));
      deltaY = Math.max(-maxDelta, Math.min(maxDelta, deltaY));
      this.pendingMouseX = Math.max(
        -maxDelta,
        Math.min(maxDelta, this.pendingMouseX + deltaX),
      );
      this.pendingMouseY = Math.max(
        -maxDelta,
        Math.min(maxDelta, this.pendingMouseY + deltaY),
      );
    },

    onMouseUp: function () {
      this.mouseButtonHeld = false;
      if (!this.isPointerLocked()) {
        this.dragging = false;
        this.resetMouseMotion();
      }
    },

    onPointerLockChange: function () {
      const pointerLocked = this.isPointerLocked();
      this.waitingForPointerLock = false;
      this.dragging = pointerLocked;
      this.resetMouseMotion();
    },

    onPointerLockError: function () {
      this.waitingForPointerLock = false;
      this.dragging = this.mouseButtonHeld;
      this.resetMouseMotion();
    },

    getTargets: function () {
      const yawEl = this.data.yawTarget || this.el;
      const pitchEl = this.data.pitchTarget || this.el;
      if (!yawEl.object3D || !pitchEl.object3D) return null;
      return { yawEl, pitchEl };
    },

    applyRotation: function (yawDelta, pitchDelta) {
      const targets = this.getTargets();
      if (!targets) return;

      targets.yawEl.object3D.rotation.y += yawDelta;
      targets.pitchEl.object3D.rotation.x += pitchDelta;

      const pitchMin = this.data.pitchMin * DEG_TO_RAD;
      const pitchMax = this.data.pitchMax * DEG_TO_RAD;
      targets.pitchEl.object3D.rotation.x = Math.max(
        pitchMin,
        Math.min(pitchMax, targets.pitchEl.object3D.rotation.x),
      );
    },

    applyMouseLook: function (deltaSec) {
      const smoothing = Math.max(0, this.data.mouseSmoothing);
      const alpha =
        smoothing === 0 ? 1 : 1 - Math.exp(-smoothing * deltaSec);

      this.smoothedMouseX +=
        (this.pendingMouseX - this.smoothedMouseX) * alpha;
      this.smoothedMouseY +=
        (this.pendingMouseY - this.smoothedMouseY) * alpha;
      this.pendingMouseX = 0;
      this.pendingMouseY = 0;

      if (
        Math.abs(this.smoothedMouseX) < 0.001 &&
        Math.abs(this.smoothedMouseY) < 0.001
      ) {
        this.smoothedMouseX = 0;
        this.smoothedMouseY = 0;
        return;
      }

      const radiansPerPixel = this.data.sensitivity * DEG_TO_RAD;
      this.applyRotation(
        -this.smoothedMouseX * radiansPerPixel,
        -this.smoothedMouseY * radiansPerPixel,
      );
    },

    applyControllerLook: function (deltaSec) {
      let x = this.axisX;
      let y = this.axisY;
      const deadzone = this.data.stickDeadzone;

      if (Math.abs(x) < deadzone) x = 0;
      if (Math.abs(y) < deadzone) y = 0;
      if (x === 0 && y === 0) return;

      const curve = Math.max(1, this.data.stickCurve);
      x = Math.sign(x) * Math.pow(Math.abs(x), curve);
      y = Math.sign(y) * Math.pow(Math.abs(y), curve);

      const yawDelta =
        -x * this.data.stickTurnSpeed * DEG_TO_RAD * deltaSec;
      const pitchDelta = this.data.stickPitchEnabled
        ? -y * this.data.stickPitchSpeed * DEG_TO_RAD * deltaSec
        : 0;
      this.applyRotation(yawDelta, pitchDelta);
    },

    tick: function (_time, deltaMs) {
      const deltaSec = Math.min(
        Math.max((deltaMs || 1000 / 60) / 1000, 0),
        0.05,
      );

      if (this.isImmersive()) {
        this.resetMouseMotion();
        this.applyControllerLook(deltaSec);
        return;
      }

      this.applyMouseLook(deltaSec);
    },

    onEnterVR: function () {
      this.resetAllInput();
      if (this.isPointerLocked() && document.exitPointerLock) {
        document.exitPointerLock();
      }
    },

    onExitVR: function () {
      this.resetAllInput();
    },

    onWindowBlur: function () {
      this.resetAllInput();
    },

    onVisibilityChange: function () {
      if (document.hidden) this.resetAllInput();
    },

    remove: function () {
      if (this.canvas) {
        this.canvas.removeEventListener(
          "mousedown",
          this.onMouseDown,
          false,
        );
      }
      if (this.controllerEl) {
        this.controllerEl.removeEventListener(
          "thumbstickmoved",
          this.onControllerMove,
        );
        this.controllerEl.removeEventListener(
          "axismove",
          this.onControllerMove,
        );
      }

      this.el.sceneEl.removeEventListener(
        "render-target-loaded",
        this.attachCanvas,
      );
      this.el.sceneEl.removeEventListener("loaded", this.bindController);
      this.el.sceneEl.removeEventListener("enter-vr", this.onEnterVR);
      this.el.sceneEl.removeEventListener("exit-vr", this.onExitVR);
      window.removeEventListener("mousemove", this.onMouseMove, false);
      window.removeEventListener("mouseup", this.onMouseUp, false);
      window.removeEventListener("blur", this.onWindowBlur, false);
      document.removeEventListener(
        "pointerlockchange",
        this.onPointerLockChange,
        false,
      );
      document.removeEventListener(
        "mozpointerlockchange",
        this.onPointerLockChange,
        false,
      );
      document.removeEventListener(
        "pointerlockerror",
        this.onPointerLockError,
        false,
      );
      document.removeEventListener(
        "visibilitychange",
        this.onVisibilityChange,
        false,
      );
    },
  });
})();
