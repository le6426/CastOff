import { useEffect, useState, useRef, useContext } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { SessionContext } from "./main";
import "./Room.css";
import { useGestureDetection } from "./useGestureDetection";
const Room = () => {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Room must be used within SessionContext");

  const { loggedIn, currentUser, isAuthLoading } = session;
  const navigate = useNavigate();

  const [roomCreatorUser, setRoomCreatorUser] = useState(``);
  const [roomJoinerUser, setRoomJoinerUser] = useState(``);
  const [isHost, setIsHost] = useState(false);
  const [inviteLink, setInviteLink] = useState(``);
  const [joinError, setJoinError] = useState(``);
  const [readyForConnection, setReadyForConnection] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [hostHP, setHostHP] = useState(100);
  const [joinerHP, setJoinerHP] = useState(100);
  const [gameWinner, setGameWinner] = useState(``);

  // Video element refs
  const hostVideoRef = useRef<HTMLVideoElement | null>(null);
  const joinerVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = isHost ? hostVideoRef : joinerVideoRef;
  const localCanvasRef = useRef<HTMLCanvasElement>(null);

  const gestureState = useGestureDetection(localVideoRef, localCanvasRef);
  const gestureStateRef = useRef(gestureState);
  useEffect(() => {
    gestureStateRef.current = gestureState;
  }, [gestureState]);
  const [opponentCharge, setOpponentCharge] = useState<{
    ability: string;
    startTime: number;
    result?: "success";
  } | null>(null);
  const prevStatusRef = useRef<"idle" | "charging" | "confirmed">("idle");
  const prevCastIdRef = useRef<number>(0);
  const prevShieldActiveRef = useRef<boolean>(false);
  const [opponentShieldActive, setOpponentShieldActive] = useState(false);

  const hostHPRef = useRef(hostHP);
  const joinerHPRef = useRef(joinerHP);

  useEffect(() => {
    hostHPRef.current = hostHP;
  }, [hostHP]);

  useEffect(() => {
    joinerHPRef.current = joinerHP;
  }, [joinerHP]);

  const checkForWinner = () => {
    if (hostHPRef.current <= 0) {
      setGameWinner(roomJoinerUser);
    } else if (joinerHPRef.current <= 0) {
      setGameWinner(roomCreatorUser);
    }
  };
  // Ref to store local stream so WebRTC can access it later
  const localStreamRef = useRef<MediaStream | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const isInitializingRef = useRef(false);

  const readyForIceCandidates = useRef(false);
  const pendingIceCandidates = useRef<RTCIceCandidate[]>([]);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL;
  const turnUser = import.meta.env.VITE_TURN_USER;
  const turnCredential = import.meta.env.VITE_TURN_PASS;

  const params = useParams();
  const roomID = params.roomID;

  const [linkCopied, setLinkCopied] = useState(false);

  const [isLeaving, setIsLeaving] = useState(false);

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(inviteLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  };

  // Initializing the room using global session state
  useEffect(() => {
    const initializeRoom = async () => {
      if (!roomID || isInitializingRef.current) return;
      if (isAuthLoading) return;

      // If user isn't logged in, redirect to login page
      if (!loggedIn || !currentUser) {
        setJoinError("You must be logged in to enter a room.");
        return;
      }

      isInitializingRef.current = true;

      try {
        // Fetch room details directly
        const get_room_response = await fetch(`${apiBaseUrl}/room/${roomID}`);

        if (!get_room_response.ok) {
          const errorData = await get_room_response.json();
          setJoinError(errorData.detail || "Room not found.");
          return;
        }

        const room_data = await get_room_response.json();
        setRoomCreatorUser(room_data.creator_user);

        // Host check based on context user
        const hostCheck = currentUser === room_data.creator_user;
        setIsHost(hostCheck);
        setInviteLink(`${window.location.origin}/room/${roomID}`);

        // Join room if user is not the host
        if (!hostCheck) {
          const join_room_response = await fetch(
            `${apiBaseUrl}/join_room/${roomID}`,
            {
              method: "POST",
              credentials: "include",
            },
          );

          if (!join_room_response.ok) {
            const errorData = await join_room_response.json();
            setJoinError(errorData.detail || "Unable to join room.");
            return;
          }
        }

        setReadyForConnection(true);
      } catch (e) {
        isInitializingRef.current = false;
        console.error("Room initialization failed:", e);
      }
    };

    initializeRoom();
  }, [roomID, loggedIn, currentUser, isAuthLoading, apiBaseUrl]);

  // GetUserMedia (video/audio)
  useEffect(() => {
    if (!readyForConnection) return;

    let stream: MediaStream | null = null;

    const startLocalMedia = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;

        // Attach stream to host element if host, or joiner element if joiner
        if (isHost && hostVideoRef.current) {
          hostVideoRef.current.srcObject = stream;
        } else if (!isHost && joinerVideoRef.current) {
          joinerVideoRef.current.srcObject = stream;
        }
        setIsMediaReady(true);
      } catch (err) {
        console.error("Failed to get local user media:", err);
      }
    };

    startLocalMedia();

    // Turn off camera & mic hardware when leaving room for cleanup
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [readyForConnection, isHost]);

  // Setup RTCPeerConnection and WebSocket
  useEffect(() => {
    if (!roomID || !readyForConnection || !isMediaReady) return;

    // 1. Instantiate Peer Connection through STUN and TURN configuration
    const rtcConfig = {
      iceServers: [
        { urls: "stun:free.expressturn.com:3478" },
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: "turn:free.expressturn.com:3478",
          username: turnUser,
          credential: turnCredential,
        },
        {
          urls: "turn:free.expressturn.com:3478?transport=tcp",
          username: turnUser,
          credential: turnCredential,
        },
      ],
    };
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;

    // 2. Attach local media tracks before handling any signaling
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // 3. Set up remote track handler
    // Event listener that triggers when other browser
    // sends its video or audio streams
    pc.ontrack = (event) => {
      console.log("Received remote track:", event.streams[0]);
      if (isHost && joinerVideoRef.current) {
        joinerVideoRef.current.srcObject = event.streams[0];
      } else if (!isHost && hostVideoRef.current) {
        hostVideoRef.current.srcObject = event.streams[0];
      }
    };

    // 4. Connect WebSocket after PeerConnection (pc) is fully prepared
    const ws = new WebSocket(`${wsBaseUrl}/ws/${roomID}`);
    wsRef.current = ws;

    pc.onicecandidate = (event) => {
      if (event.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "candidate",
            candidate: event.candidate,
          }),
        );
      }
    };

    ws.onopen = () => {
      console.log("Connected to signaling server!");
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("WS Received:", data.type);

        // HOST: Initiate Offer when ready signal received
        if (data.type === "ready" && isHost) {
          console.log("Host creating offer with local tracks...");
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({ type: "offer", sdp: offer }));
        }

        // JOINER: Respond to incoming offer
        else if (data.type === "offer" && !isHost) {
          console.log("Joiner received offer, setting remote description...");
          if (currentUser) setRoomJoinerUser(currentUser);
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          readyForIceCandidates.current = true;
          while (pendingIceCandidates.current.length > 0) {
            await pc.addIceCandidate(pendingIceCandidates.current.shift());
          }
          console.log("Joiner creating answer with local tracks...");
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(
            JSON.stringify({
              type: "answer",
              sdp: answer,
              joinerUser: currentUser,
            }),
          );
        }

        // HOST: Process answer from Joiner
        else if (data.type === "answer" && isHost) {
          console.log("Host received answer!");
          setRoomJoinerUser(data.joinerUser);
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          readyForIceCandidates.current = true;

          while (pendingIceCandidates.current.length > 0) {
            await pc.addIceCandidate(pendingIceCandidates.current.shift());
          }
        }

        // BOTH: Add remote ICE candidate
        else if (data.type === "candidate") {
          if (!readyForIceCandidates.current) {
            pendingIceCandidates.current.push(
              new RTCIceCandidate(data.candidate),
            );
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        }

        // JOINER: Checks game results
        else if (data.type === "cast_confirmed") {
          setOpponentCharge((prev) =>
            prev ? { ...prev, result: "success" } : prev,
          );

          if (data.ability === "fireball") {
            const iAmShielded = gestureStateRef.current.shieldActive;
            if (!iAmShielded) {
              // My HP goes down — I'm the one being hit
              if (isHost) {
                setHostHP((prev) => {
                  const newHP = Math.max(0, prev - 20);
                  ws.send(
                    JSON.stringify({
                      type: "hp_update",
                      role: "host",
                      hp: newHP,
                    }),
                  );
                  checkForWinner();
                  return newHP;
                });
              } else {
                setJoinerHP((prev) => {
                  const newHP = Math.max(0, prev - 20);
                  ws.send(
                    JSON.stringify({
                      type: "hp_update",
                      role: "joiner",
                      hp: newHP,
                    }),
                  );
                  checkForWinner();
                  return newHP;
                });
              }
            }
          }

          setTimeout(() => {
            setOpponentCharge((prev) =>
              prev?.result === "success" ? null : prev,
            );
          }, 500);
        } else if (data.type === "hp_update") {
          if (data.role === "host") {
            setHostHP(data.hp);
          } else {
            setJoinerHP(data.hp);
          }
          checkForWinner();
        }
        // OPPONENT: started charging an ability
        else if (data.type === "charging_started") {
          setOpponentCharge({ ability: data.ability, startTime: Date.now() });
        }

        // OPPONENT: successfully cast — flash "success" briefly, then clear
        else if (data.type === "cast_confirmed") {
          setOpponentCharge((prev) =>
            prev ? { ...prev, result: "success" } : prev,
          );
          // TODO: apply damage based on data.ability

          setTimeout(() => {
            setOpponentCharge((prev) =>
              prev?.result === "success" ? null : prev,
            );
          }, 500);
        }

        // OPPONENT: charge was cancelled/interrupted
        else if (data.type === "charging_cancelled") {
          setOpponentCharge(null);
        }

        // OPPONENT: shield toggled
        else if (data.type === "shield_activated") {
          setOpponentShieldActive(true);
        } else if (data.type === "shield_deactivated") {
          setOpponentShieldActive(false);
        }
      } catch (err) {
        console.error("Error processing WebSocket message:", err);
      }
    };

    ws.onclose = (event) =>
      console.log(`Closed (${event.code}): ${event.reason}`);

    // Cleanup connection on unmount or state change
    return () => {
      ws.close();
      pc.close();
      peerConnectionRef.current = null;
      wsRef.current = null;
    };
  }, [readyForConnection, isMediaReady, isHost, roomID]);

  // Send fireball gesture state changes to the opponent over the existing WebSocket
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const wasCharging = prevStatusRef.current === "charging";
    const isNowCharging = gestureState.status === "charging";
    const castIdChanged = gestureState.castId !== prevCastIdRef.current;

    // idle/confirmed -> charging: notify opponent charging started
    if (isNowCharging && !wasCharging) {
      ws.send(
        JSON.stringify({
          type: "charging_started",
          role: isHost ? "host" : "joiner",
          ability: gestureState.ability,
        }),
      );
    }

    // castId incremented: notify opponent the cast completed
    if (castIdChanged) {
      ws.send(
        JSON.stringify({
          type: "cast_confirmed",
          role: isHost ? "host" : "joiner",
          ability: gestureState.ability,
        }),
      );
    }

    // charging -> idle, but NOT via a confirm: charge was cancelled
    if (wasCharging && gestureState.status === "idle" && !castIdChanged) {
      ws.send(
        JSON.stringify({
          type: "charging_cancelled",
          role: isHost ? "host" : "joiner",
        }),
      );
    }

    prevStatusRef.current = gestureState.status;
    prevCastIdRef.current = gestureState.castId;
  }, [gestureState, isHost]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (gestureState.shieldActive !== prevShieldActiveRef.current) {
      ws.send(
        JSON.stringify({
          type: gestureState.shieldActive
            ? "shield_activated"
            : "shield_deactivated",
          role: isHost ? "host" : "joiner",
        }),
      );
      prevShieldActiveRef.current = gestureState.shieldActive;
    }
  }, [gestureState.shieldActive, isHost]);

  const handleLeaveRoom = () => {
    const leaveRoom = async () => {
      if (isLeaving) return; // Prevent multiple leave requests
      setIsLeaving(true);
      try {
        const leave_room_response = await fetch(
          `${apiBaseUrl}/leave_room/${roomID}`,
          {
            method: "POST",
            credentials: "include",
          },
        );

        if (leave_room_response.ok) {
          navigate("/");
        } else {
          const errorData = await leave_room_response.json();
          setJoinError(errorData.detail);
        }
      } finally {
        setIsLeaving(false);
      }
    };
    leaveRoom();
  };

  useEffect(() => {
    const handlePageHide = () => {
      if (!roomID) return;

      fetch(`${apiBaseUrl}/leave_room/${roomID}`, {
        method: "POST",
        credentials: "include",
        keepalive: true, // Guarantees request completes even if tab closes
      });
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [roomID]);

  const handleStartGame = () => {
    console.log("game started");
  };

  return (
    <>
      {joinError ? (
        <div className="room-error">
          <p>{joinError}</p>
          <button className="btn-secondary">
            <Link to="/">Go to Home</Link>
          </button>
        </div>
      ) : (
        <div className="room">
          <div className="room__topbar">
            <div className="room__topbar-info">
              <div className="room__meta">
                <span>
                  Host: <strong>{roomCreatorUser}</strong>
                </span>
                <span>
                  You: <strong>{currentUser}</strong>
                </span>
                {gameWinner && (
                  <span className="room__winner">
                    Winner: <strong>{gameWinner}</strong>
                  </span>
                )}
              </div>
              {isHost && (
                <div className="room__invite">
                  <span>Invite:</span>
                  <code>{inviteLink}</code>
                  <button
                    className="btn-secondary btn-copy"
                    onClick={handleCopyInvite}
                  >
                    {linkCopied ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
            </div>

            <div className="room__actions">
              {isHost && <button onClick={handleStartGame}>Start Game</button>}
              <button
                className="btn-secondary"
                onClick={handleLeaveRoom}
                disabled={isLeaving}
              >
                {isLeaving ? "Leaving..." : "Leave Room"}
              </button>
            </div>
          </div>

          <div className="room__stage">
            <div className="video-tile" style={{ position: "relative" }}>
              <video
                ref={hostVideoRef}
                autoPlay
                playsInline
                muted={isHost}
                className="video-tile__video"
              />
              {isHost && (
                <canvas
                  ref={localCanvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    transform: "scaleX(-1)",
                  }}
                />
              )}
              <div className="video-tile__overlay">
                <span className="video-tile__name">
                  {roomCreatorUser} (Host)
                </span>
                <div className="video-tile__hp">
                  <div className="video-tile__hp-bar-bg">
                    <div
                      className="video-tile__hp-bar-fill"
                      style={{ width: `${hostHP}%` }}
                    />
                  </div>
                  <span className="video-tile__hp-text">{hostHP} / 100</span>
                </div>
              </div>
            </div>
            <div className="video-tile" style={{ position: "relative" }}>
              <video
                ref={joinerVideoRef}
                autoPlay
                playsInline
                muted={!isHost}
                className="video-tile__video"
              />
              {!isHost && (
                <canvas
                  ref={localCanvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    transform: "scaleX(-1)",
                  }}
                />
              )}
              <div className="video-tile__overlay">
                <span className="video-tile__name">
                  {roomJoinerUser || "Waiting for joiner..."}
                </span>
                <div className="video-tile__hp">
                  <div className="video-tile__hp-bar-bg">
                    <div
                      className="video-tile__hp-bar-fill"
                      style={{ width: `${hostHP}%` }}
                    />
                  </div>
                  <span className="video-tile__hp-text">{hostHP} / 100</span>
                </div>{" "}
              </div>
            </div>

            <div
              style={{
                position: "fixed",
                top: 10,
                left: 10,
                background: "black",
                color: "lime",
                padding: "8px",
                fontFamily: "monospace",
                zIndex: 999,
              }}
            >
              status: {gestureState.status} | ability:{" "}
              {gestureState.ability ?? "none"} | castId: {gestureState.castId} |
              opp_fireball: {opponentCharge?.ability ?? "none"} | result:{" "}
              {opponentCharge?.result ?? "-"} | opp_shield:{" "}
              {opponentShieldActive ? "active" : "inactive"} | my_shield:{" "}
              {gestureState.shieldActive ? "active" : "inactive"}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Room;
