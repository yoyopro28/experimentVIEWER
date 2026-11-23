(() => {
  "use strict";

  const mobileQuery = window.matchMedia(
    "(hover: none) and (pointer: coarse)",
  );
  const DEG_TO_RAD = Math.PI / 180;
  const LOOK_SENSITIVITY = 0.27 * DEG_TO_RAD;
  const LOOK_PITCH_LIMIT = 80 * DEG_TO_RAD;

  function hasTouchInput() {
    return navigator.maxTouchPoints > 0 || "ontouchstart" in window;
  }

  function isMobileDevice() {
    const userAgentDataMobile = navigator.userAgentData?.mobile === true;
    const mobileUserAgent = /Android|iPhone|iPod|iPad|Mobile/i.test(
      navigator.userAgent,
    );
    const iPadDesktopMode =
      navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

    return userAgentDataMobile || mobileUserAgent || iPadDesktopMode;
  }

  function startMobileControls() {
    if (document.getElementById("mobile-locomotion-controls")) return;

    const controls = document.createElement("div");
    controls.id = "mobile-locomotion-controls";
    controls.hidden = true;
    controls.setAttribute("aria-hidden", "true");
    controls.innerHTML = `
      <div
        id="mobile-move-zone"
        role="application"
        aria-label="Virtueller Joystick zum Bewegen"
      >
        <div id="mobile-move-stick"></div>
      </div>
      <button
        id="mobile-jump-button"
        type="button"
        aria-label="Springen"
      >
        <span class="mobile-jump-arrow" aria-hidden="true">↑</span>
        SPRUNG
      </button>
    `;
    document.body.appendChild(controls);

    const moveZone = document.getElementById("mobile-move-zone");
    const moveStick = document.getElementById("mobile-move-stick");
    const jumpButton = document.getElementById("mobile-jump-button");

    let activePointerId = null;
    const activeJumpPointers = new Set();
    let lookSurface = null;
    let lookPointerId = null;
    let previousLookX = 0;
    let previousLookY = 0;
    let immersiveMode = false;

    function emitMovement(x, y) {
      const controller = document.getElementById("ctlL");
      if (!controller) return;

      const detail = { x, y };
      if (typeof controller.emit === "function") {
        controller.emit("thumbstickmoved", detail, false);
      } else {
        controller.dispatchEvent(
          new CustomEvent("thumbstickmoved", { detail }),
        );
      }
    }

    function resetJoystick() {
      activePointerId = null;
      moveStick.style.transform = "translate3d(0, 0, 0)";
      emitMovement(0, 0);
    }

    function updateJoystick(event) {
      const bounds = moveZone.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const radius = Math.max(1, bounds.width / 2 - moveStick.offsetWidth / 2);
      const rawX = event.clientX - centerX;
      const rawY = event.clientY - centerY;
      const distance = Math.hypot(rawX, rawY);
      const scale = distance > radius ? radius / distance : 1;
      const x = rawX * scale;
      const y = rawY * scale;

      moveStick.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      emitMovement(x / radius, y / radius);
    }

    function controlsAreAllowed() {
      return (
        mobileQuery.matches &&
        hasTouchInput() &&
        isMobileDevice() &&
        !immersiveMode
      );
    }

    function resetLookInput() {
      if (
        lookSurface &&
        lookPointerId !== null &&
        lookSurface.hasPointerCapture(lookPointerId)
      ) {
        lookSurface.releasePointerCapture(lookPointerId);
      }
      lookPointerId = null;
    }

    function resetJumpInputs() {
      for (const pointerId of activeJumpPointers) {
        if (jumpButton.hasPointerCapture(pointerId)) {
          jumpButton.releasePointerCapture(pointerId);
        }
      }
      activeJumpPointers.clear();
      jumpButton.classList.remove("is-pressed");
    }

    function refreshControlMode() {
      const enabled = controlsAreAllowed();
      document.body.classList.toggle("mobile-locomotion-enabled", enabled);
      controls.hidden = !enabled;
      controls.setAttribute("aria-hidden", String(!enabled));
      if (!enabled) {
        resetJoystick();
        resetLookInput();
        resetJumpInputs();
      }
    }

    moveZone.addEventListener("pointerdown", (event) => {
      if (!controlsAreAllowed() || activePointerId !== null) return;
      event.preventDefault();
      event.stopPropagation();
      activePointerId = event.pointerId;
      moveZone.setPointerCapture(event.pointerId);
      updateJoystick(event);
    });

    moveZone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== activePointerId) return;
      event.preventDefault();
      event.stopPropagation();
      updateJoystick(event);
    });

    function finishJoystick(event) {
      if (event.pointerId !== activePointerId) return;
      event.preventDefault();
      event.stopPropagation();
      if (moveZone.hasPointerCapture(event.pointerId)) {
        moveZone.releasePointerCapture(event.pointerId);
      }
      resetJoystick();
    }

    moveZone.addEventListener("pointerup", finishJoystick);
    moveZone.addEventListener("pointercancel", finishJoystick);
    moveZone.addEventListener("lostpointercapture", () => {
      if (activePointerId !== null) resetJoystick();
    });

    jumpButton.addEventListener("pointerdown", (event) => {
      if (!controlsAreAllowed()) return;
      event.preventDefault();
      event.stopPropagation();
      activeJumpPointers.add(event.pointerId);
      jumpButton.setPointerCapture(event.pointerId);
      jumpButton.classList.add("is-pressed");
      const rig = document.getElementById("cameraRig");
      if (rig && typeof rig.emit === "function") rig.emit("jump");
    });

    function releaseJump(event) {
      event.preventDefault();
      event.stopPropagation();
      activeJumpPointers.delete(event.pointerId);
      if (jumpButton.hasPointerCapture(event.pointerId)) {
        jumpButton.releasePointerCapture(event.pointerId);
      }
      jumpButton.classList.toggle(
        "is-pressed",
        activeJumpPointers.size > 0,
      );
    }

    jumpButton.addEventListener("pointerup", releaseJump);
    jumpButton.addEventListener("pointercancel", releaseJump);

    const scene = document.querySelector("a-scene");

    function onLookStart(event) {
      if (
        !controlsAreAllowed() ||
        event.pointerType !== "touch" ||
        lookPointerId !== null ||
        event.clientX < window.innerWidth * 0.42
      ) {
        return;
      }

      event.preventDefault();
      lookPointerId = event.pointerId;
      previousLookX = event.clientX;
      previousLookY = event.clientY;
      lookSurface.setPointerCapture(event.pointerId);
    }

    function onLookMove(event) {
      if (event.pointerId !== lookPointerId) return;
      event.preventDefault();

      const deltaX = event.clientX - previousLookX;
      const deltaY = event.clientY - previousLookY;
      previousLookX = event.clientX;
      previousLookY = event.clientY;

      const yawRig = document.getElementById("yawRig");
      const pitchRig = document.getElementById("pitchRig");
      if (!yawRig?.object3D || !pitchRig?.object3D) return;

      // Invertiert gegenüber der bisherigen A-Frame-Touchsteuerung.
      yawRig.object3D.rotation.y -= deltaX * LOOK_SENSITIVITY;
      pitchRig.object3D.rotation.x -= deltaY * LOOK_SENSITIVITY;
      pitchRig.object3D.rotation.x = Math.max(
        -LOOK_PITCH_LIMIT,
        Math.min(LOOK_PITCH_LIMIT, pitchRig.object3D.rotation.x),
      );
    }

    function onLookEnd(event) {
      if (event.pointerId !== lookPointerId) return;
      event.preventDefault();
      if (lookSurface.hasPointerCapture(event.pointerId)) {
        lookSurface.releasePointerCapture(event.pointerId);
      }
      lookPointerId = null;
    }

    function attachLookSurface() {
      const nextSurface = scene?.canvas;
      if (!nextSurface || nextSurface === lookSurface) return;

      if (lookSurface) {
        lookSurface.removeEventListener("pointerdown", onLookStart);
        lookSurface.removeEventListener("pointermove", onLookMove);
        lookSurface.removeEventListener("pointerup", onLookEnd);
        lookSurface.removeEventListener("pointercancel", onLookEnd);
      }

      lookSurface = nextSurface;
      lookSurface.addEventListener("pointerdown", onLookStart, {
        passive: false,
      });
      lookSurface.addEventListener("pointermove", onLookMove, {
        passive: false,
      });
      lookSurface.addEventListener("pointerup", onLookEnd, {
        passive: false,
      });
      lookSurface.addEventListener("pointercancel", onLookEnd, {
        passive: false,
      });
    }

    if (scene) {
      scene.addEventListener("render-target-loaded", attachLookSurface);
      attachLookSurface();
      scene.addEventListener("enter-vr", () => {
        immersiveMode = true;
        refreshControlMode();
      });
      scene.addEventListener("exit-vr", () => {
        immersiveMode = false;
        refreshControlMode();
      });
    }

    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", refreshControlMode);
    } else {
      mobileQuery.addListener(refreshControlMode);
    }

    function resetAllInputs() {
      resetJoystick();
      resetLookInput();
      resetJumpInputs();
    }

    window.addEventListener("blur", resetAllInputs);
    window.addEventListener("orientationchange", resetAllInputs);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) resetAllInputs();
    });

    refreshControlMode();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startMobileControls, {
      once: true,
    });
  } else {
    startMobileControls();
  }
})();
