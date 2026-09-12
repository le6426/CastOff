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
  shieldActive: boolean;
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

  const normalZ = v1.x * v2.y - v1.y * v2.x;

  // Chirality signal derived directly from landmark geometry (stable),
  // rather than MediaPipe's separate handedness classifier (unstable —
  // flickers between Left/Right when the palm faces the camera directly).
  // Empirically confirmed: x5 - x17 < 0 (this hand) facing camera -> normalZ > 0.
  const isChiralityA = indexMcp.x - pinkyMcp.x < 0;

  return isChiralityA ? normalZ > 0 : normalZ < 0;
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

// Same 21-point connection topology as MediaPipe's HAND_CONNECTIONS.
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4], // thumb
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8], // index
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12], // middle
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16], // ring
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20], // pinky
  [0, 17], // palm base
];

function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];
    ctx.beginPath();
    ctx.moveTo(start.x * width, start.y * height);
    ctx.lineTo(end.x * width, end.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = "#ff0000";
  for (const point of landmarks) {
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 4, 0, 2 * Math.PI);
    ctx.fill();
  }
}

export function useGestureDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef?: React.RefObject<HTMLCanvasElement | null>,
  gameStarted: boolean = true,
) {
  const [state, setState] = useState<GestureDetectionState>({
    status: "idle",
    ability: null,
    castId: 0,
    shieldActive: false,
  });

  // Position tracking — plain refs, not state, since they update every
  // single frame and would cause excessive re-renders as React state.
  // Room.tsx polls these independently at a controlled rate.
  const indexTipRef = useRef<{ x: number; y: number } | null>(null);
  const palmCenterRef = useRef<{ x: number; y: number } | null>(null);

  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);

  // Mirrors the gameStarted prop into a ref so the detection loop (set up
  // once, empty dependency array) always reads the LIVE value rather than
  // whatever gameStarted was at the moment the loop was created — the same
  // kind of staleness bug we hit with the video ref earlier.
  const gameStartedRef = useRef(gameStarted);
  useEffect(() => {
    gameStartedRef.current = gameStarted;
  }, [gameStarted]);

  // Internal timing state — doesn't need to be React state,
  // since nothing outside the loop reads it directly.
  const chargingAbilityRef = useRef<string | null>(null);
  const chargeStartTimeRef = useRef<number>(0);
  const lastSeenCorrectTimeRef = useRef<number>(0);
  const castIdRef = useRef<number>(0);

  // Shield's independent on/off track (no charge-up, just a grace period).
  const shieldActiveRef = useRef<boolean>(false);
  const lastSeenShieldTimeRef = useRef<number>(0);

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

        // Update position refs every frame, regardless of gameStarted —
        // these are read on-demand by Room.tsx, not gated here.
        if (result.landmarks.length > 0) {
          const lm = result.landmarks[0];
          indexTipRef.current = { x: lm[8].x, y: lm[8].y };
          palmCenterRef.current = { x: lm[9].x, y: lm[9].y };
        } else {
          indexTipRef.current = null;
          palmCenterRef.current = null;
        }

        const canvas = canvasRef?.current;
        if (canvas) {
          // Keep canvas pixel size in sync with the video's displayed size.
          if (
            canvas.width !== video.videoWidth ||
            canvas.height !== video.videoHeight
          ) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          const ctx = canvas.getContext("2d");
          if (ctx) {
            if (result.landmarks.length > 0) {
              drawHandSkeleton(
                ctx,
                result.landmarks[0],
                canvas.width,
                canvas.height,
              );
            } else {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
          }
        }

        // Detection and drawing always run — only the actual charge/cast/
        // shield gameplay logic is gated behind the game having started.
        if (gameStartedRef.current) {
          applyShieldTransition(detected, now);
          applyFireballTransition(detected, now);
        }
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

  function applyShieldTransition(detected: string | null, now: number) {
    if (detected === "shield") {
      lastSeenShieldTimeRef.current = now;
      if (!shieldActiveRef.current) {
        shieldActiveRef.current = true;
        setState((prev) => ({ ...prev, shieldActive: true }));
      }
      return;
    }

    // detected is null or a different gesture — check grace period.
    if (
      shieldActiveRef.current &&
      now - lastSeenShieldTimeRef.current > GRACE_PERIOD_MS
    ) {
      shieldActiveRef.current = false;
      setState((prev) => ({ ...prev, shieldActive: false }));
    }
    // else: within grace period, stay active untouched.
  }

  function applyFireballTransition(detected: string | null, now: number) {
    // Fireball is the only ability that goes through the charge machine.
    // Anything else (null, or "shield") is treated as "not fireball".
    const isFireball = detected === "fireball";
    const chargingAbility = chargingAbilityRef.current;

    if (chargingAbility === null) {
      // idle -> charging
      if (isFireball) {
        chargingAbilityRef.current = "fireball";
        chargeStartTimeRef.current = now;
        lastSeenCorrectTimeRef.current = now;
        setState((prev) => ({
          ...prev,
          status: "charging",
          ability: "fireball",
          castId: castIdRef.current,
        }));
      }
      // idle -> idle: nothing to do
      return;
    }

    // We're charging fireball.
    if (isFireball) {
      lastSeenCorrectTimeRef.current = now;

      if (now - chargeStartTimeRef.current >= CHARGE_DURATION_MS) {
        // charging -> confirmed
        castIdRef.current += 1;
        chargingAbilityRef.current = null;

        setState((prev) => ({
          ...prev,
          status: "confirmed",
          ability: "fireball",
          castId: castIdRef.current,
        }));

        // confirmed -> idle on the next tick (momentary pulse)
        setTimeout(() => {
          setState((prev) =>
            prev.castId === castIdRef.current
              ? { ...prev, status: "idle", ability: null }
              : prev,
          );
        }, 0);
      }
      // else: still charging, no state change needed (status/ability unchanged)
      return;
    }

    // detected is null or "shield" — check grace period.
    if (now - lastSeenCorrectTimeRef.current > GRACE_PERIOD_MS) {
      // charging -> idle (cancelled)
      chargingAbilityRef.current = null;
      setState((prev) => ({ ...prev, status: "idle", ability: null }));
    }
    // else: within grace period, stay charging untouched.
  }

  return { ...state, indexTipRef, palmCenterRef };
}
