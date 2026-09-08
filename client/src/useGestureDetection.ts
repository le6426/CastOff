import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

const CHARGE_DURATION_MS = 3000;
const GRACE_PERIOD_MS = 400;

export type GestureStatus = "idle" | "charging" | "confirmed";

export interface GestureDetectionState {
  status: GestureStatus;
  ability: string | null;
  castId: number;
}

function isIndexPointingUp(landmarks: NormalizedLandmark[]): boolean {
  // Index finger: 5 (MCP) -> 6 (PIP) -> 7 (DIP) -> 8 (tip)
  // Extended + pointing up: y decreases monotonically toward the tip.
  const indexExtended =
    landmarks[8].y < landmarks[6].y && landmarks[6].y < landmarks[5].y;

  // Middle, ring, pinky curled: tip not above its own knuckle.
  const middleCurled = landmarks[12].y >= landmarks[9].y;
  const ringCurled = landmarks[16].y >= landmarks[13].y;
  const pinkyCurled = landmarks[20].y >= landmarks[17].y;

  // Thumb (1-4) is intentionally ignored.

  return indexExtended && middleCurled && ringCurled && pinkyCurled;
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const SEPARATION_THRESHOLD = 0.3; // relative to palm width

function areFingersSpread(landmarks: NormalizedLandmark[]): boolean {
  const indexExtended =
    landmarks[8].y < landmarks[6].y && landmarks[6].y < landmarks[5].y;
  const middleExtended =
    landmarks[12].y < landmarks[10].y && landmarks[10].y < landmarks[9].y;
  const ringExtended =
    landmarks[16].y < landmarks[14].y && landmarks[14].y < landmarks[13].y;
  const pinkyExtended =
    landmarks[20].y < landmarks[18].y && landmarks[18].y < landmarks[17].y;

  if (!(indexExtended && middleExtended && ringExtended && pinkyExtended)) {
    return false;
  }

  const palmWidth = distance(landmarks[5], landmarks[17]);
  if (palmWidth === 0) return false;

  const gapIndexMiddle = distance(landmarks[8], landmarks[12]) / palmWidth;
  const gapMiddleRing = distance(landmarks[12], landmarks[16]) / palmWidth;
  const gapRingPinky = distance(landmarks[16], landmarks[20]) / palmWidth;

  return (
    gapIndexMiddle > SEPARATION_THRESHOLD &&
    gapMiddleRing > SEPARATION_THRESHOLD &&
    gapRingPinky > SEPARATION_THRESHOLD
  );
}

function isPalmFacingCamera(landmarks: NormalizedLandmark[]): boolean {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];

  // Two vectors lying roughly in the plane of the palm.
  const v1 = {
    x: indexMcp.x - wrist.x,
    y: indexMcp.y - wrist.y,
    z: indexMcp.z - wrist.z,
  };
  const v2 = {
    x: pinkyMcp.x - wrist.x,
    y: pinkyMcp.y - wrist.y,
    z: pinkyMcp.z - wrist.z,
  };

  // Cross product v1 x v2 gives a vector perpendicular to the palm.
  const normalZ = v1.x * v2.y - v1.y * v2.x;
  // Note: using the 2D (x,y) cross product's implied z-component here
  // is sufficient to distinguish palm-toward-camera vs away, since a
  // mirrored (BGR->RGB flipped) or non-mirrored feed affects the sign —
  // verify against your actual camera feed and flip the comparison if needed.

  return normalZ < 0;
}

/**
 * Given a single hand's landmarks, return the ability name this gesture
 * corresponds to, or null if it doesn't match any recognized gesture.
 */
function classifyGesture(landmarks: NormalizedLandmark[]): string | null {
  if (isIndexPointingUp(landmarks)) {
    return "fireball";
  }

  if (areFingersSpread(landmarks) && isPalmFacingCamera(landmarks)) {
    return "shield";
  }

  return null;
}

export function useGestureDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const [state, setState] = useState<GestureDetectionState>({
    status: "idle",
    ability: null,
    castId: 0,
  });

  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);

  // Internal timing state — doesn't need to be React state,
  // since nothing outside the loop reads it directly.
  const chargingAbilityRef = useRef<string | null>(null);
  const chargeStartTimeRef = useRef<number>(0);
  const lastSeenCorrectTimeRef = useRef<number>(0);
  const castIdRef = useRef<number>(0);

  // Set up the HandLandmarker once.
  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
      );
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });
      if (!cancelled) {
        landmarkerRef.current = landmarker;
      }
    };

    setup();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  // Main detection loop.
  useEffect(() => {
    const loop = () => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (video && landmarker && video.readyState >= 2) {
        const now = performance.now();
        const result = landmarker.detectForVideo(video, now);

        const detected: string | null =
          result.landmarks.length > 0
            ? classifyGesture(result.landmarks[0])
            : null;

        // TEMP debug
        console.log(
          "hands detected:",
          result.landmarks.length,
          "gesture:",
          detected,
        );

        applyTransition(detected, now);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTransition(detected: string | null, now: number) {
    const chargingAbility = chargingAbilityRef.current;

    if (chargingAbility === null) {
      // idle -> charging
      if (detected !== null) {
        chargingAbilityRef.current = detected;
        chargeStartTimeRef.current = now;
        lastSeenCorrectTimeRef.current = now;
        setState({
          status: "charging",
          ability: detected,
          castId: castIdRef.current,
        });
      }
      // idle -> idle: nothing to do
      return;
    }

    // We're charging `chargingAbility`.
    if (detected === chargingAbility) {
      lastSeenCorrectTimeRef.current = now;

      if (now - chargeStartTimeRef.current >= CHARGE_DURATION_MS) {
        // charging -> confirmed
        castIdRef.current += 1;
        const confirmedAbility = chargingAbility;

        chargingAbilityRef.current = null;

        setState({
          status: "confirmed",
          ability: confirmedAbility,
          castId: castIdRef.current,
        });

        // confirmed -> idle on the next tick (momentary pulse)
        setTimeout(() => {
          setState((prev) =>
            prev.castId === castIdRef.current
              ? { status: "idle", ability: null, castId: prev.castId }
              : prev,
          );
        }, 0);
      }
      // else: still charging, no state change needed (status/ability unchanged)
      return;
    }

    // detected is null or a different gesture — check grace period.
    if (now - lastSeenCorrectTimeRef.current > GRACE_PERIOD_MS) {
      // charging -> idle (cancelled)
      chargingAbilityRef.current = null;
      setState({ status: "idle", ability: null, castId: castIdRef.current });
    }
    // else: within grace period, stay charging untouched.
  }

  return state;
}
