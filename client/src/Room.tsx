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

  // Stable ref for "my own local video element" — identity never changes,
  // only .current gets pointed at whichever real <video> is local, once
  // getUserMedia resolves and we know for sure.
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localCanvasRef = useRef<HTMLCanvasElement>(null);

  const [gameStarted, setGameStarted] = useState(false);
  const gestureState = useGestureDetection(
    localVideoRef,
    localCanvasRef,
    gameStarted,
  );
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

  // Live position of the opponent's fireball fingertip / shield palm-center,
  // streamed over the WebSocket while the corresponding ability is active.
  const [opponentFireballPos, setOpponentFireballPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [opponentShieldPos, setOpponentShieldPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // My own live position — same data, but for rendering the icon on my
  // own tile locally, with no network round-trip needed.
  const [myFireballPos, setMyFireballPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [myShieldPos, setMyShieldPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [myChargeStartTime, setMyChargeStartTime] = useState<number>(0);

  const [rematchVotes, setRematchVotes] = useState<{
    host: boolean;
    joiner: boolean;
  }>({
    host: false,
    joiner: false,
  });

  const hostHPRef = useRef(hostHP);
  const joinerHPRef = useRef(joinerHP);

  useEffect(() => {
    hostHPRef.current = hostHP;
  }, [hostHP]);

  useEffect(() => {
    joinerHPRef.current = joinerHP;
  }, [joinerHP]);

  // Mirrored into refs so checkForWinner (called from a long-lived
  // WebSocket closure) always reads the live username, not a stale
  // snapshot from whenever that closure was first created.
  const roomCreatorUserRef = useRef(roomCreatorUser);
  const roomJoinerUserRef = useRef(roomJoinerUser);

  useEffect(() => {
    roomCreatorUserRef.current = roomCreatorUser;
  }, [roomCreatorUser]);

  useEffect(() => {
    roomJoinerUserRef.current = roomJoinerUser;
  }, [roomJoinerUser]);

  const checkForWinner = () => {
    if (hostHPRef.current <= 0) {
      setGameWinner(roomJoinerUserRef.current);
      setGameStarted(false);
    } else if (joinerHPRef.current <= 0) {
      setGameWinner(roomCreatorUserRef.current);
      setGameStarted(false);
    }
  };

  const handleRematchClick = () => {
    const myRole = isHost ? "host" : "joiner";
    setRematchVotes((prev) => ({ ...prev, [myRole]: true }));

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "rematch_ready", role: myRole }),
      );
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

        // Attach stream to host element if host, or joiner element if joiner.
        // Also point the stable localVideoRef at whichever element is truly
        // local — this is what the gesture-detection hook actually reads.
        if (isHost && hostVideoRef.current) {
          hostVideoRef.current.srcObject = stream;
          localVideoRef.current = hostVideoRef.current;
        } else if (!isHost && joinerVideoRef.current) {
          joinerVideoRef.current.srcObject = stream;
          localVideoRef.current = joinerVideoRef.current;
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

        // BOTH: game (re)started — reset HP and clear winner
        else if (data.type === "game_started") {
          setHostHP(100);
          setJoinerHP(100);
          hostHPRef.current = 100;
          joinerHPRef.current = 100;
          setGameWinner("");
          setGameStarted(true);
        }

        // OPPONENT: successfully cast — apply damage (unless shielded), flash briefly
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
                  hostHPRef.current = newHP;
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
                  joinerHPRef.current = newHP;
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
            setOpponentFireballPos(null);
          }, 500);
        }

        // BOTH: receive an HP update from the other client
        else if (data.type === "hp_update") {
          if (data.role === "host") {
            hostHPRef.current = data.hp;
            setHostHP(data.hp);
          } else {
            joinerHPRef.current = data.hp;
            setJoinerHP(data.hp);
          }
          checkForWinner();
        }

        // OPPONENT: started charging an ability
        else if (data.type === "charging_started") {
          setOpponentCharge({ ability: data.ability, startTime: Date.now() });
          setOpponentFireballPos(null);
        }

        // OPPONENT: charge was cancelled/interrupted
        else if (data.type === "charging_cancelled") {
          setOpponentCharge(null);
          setOpponentFireballPos(null);
        }

        // OPPONENT: shield toggled
        else if (data.type === "shield_activated") {
          setOpponentShieldActive(true);
        } else if (data.type === "shield_deactivated") {
          setOpponentShieldActive(false);
          setOpponentShieldPos(null);
        }

        // OPPONENT: live fireball fingertip position while charging
        else if (data.type === "fireball_position") {
          setOpponentFireballPos({ x: data.x, y: data.y });
        }

        // OPPONENT: live shield palm-center position while active
        else if (data.type === "shield_position") {
          setOpponentShieldPos({ x: data.x, y: data.y });
        }

        // Rematch consensus
        else if (data.type === "rematch_ready") {
          setRematchVotes((prev) => ({ ...prev, [data.role]: true }));
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

  // Sending fireball gesture state changes to the opponent
  const lastChargingAbilityRef = useRef<string | null>(null);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const wasCharging = prevStatusRef.current === "charging";
    const isNowCharging = gestureState.status === "charging";
    const castIdChanged = gestureState.castId !== prevCastIdRef.current;

    // idle/confirmed -> charging: notify opponent charging started
    if (isNowCharging && !wasCharging) {
      lastChargingAbilityRef.current = gestureState.ability;
      setMyChargeStartTime(Date.now());
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
          ability: lastChargingAbilityRef.current,
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

  // Sending shield state changes to the opponent
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

  // Stream live position updates to the opponent while actively
  // charging fireball or holding shield — and mirror the same data into
  // local state so my own tile can show my own icon too, with no
  // network round-trip needed for that part.
  useEffect(() => {
    const intervalId = setInterval(() => {
      const ws = wsRef.current;

      if (
        gestureState.status === "charging" &&
        gestureState.ability === "fireball"
      ) {
        const pos = gestureState.indexTipRef.current;
        setMyFireballPos(pos);
        if (ws && ws.readyState === WebSocket.OPEN && pos) {
          ws.send(
            JSON.stringify({
              type: "fireball_position",
              role: isHost ? "host" : "joiner",
              x: pos.x,
              y: pos.y,
            }),
          );
        }
      } else {
        setMyFireballPos(null);
      }

      if (gestureState.shieldActive) {
        const pos = gestureState.palmCenterRef.current;
        setMyShieldPos(pos);
        if (ws && ws.readyState === WebSocket.OPEN && pos) {
          ws.send(
            JSON.stringify({
              type: "shield_position",
              role: isHost ? "host" : "joiner",
              x: pos.x,
              y: pos.y,
            }),
          );
        }
      } else {
        setMyShieldPos(null);
      }
    }, 80); // ~12 times/sec

    return () => clearInterval(intervalId);
  }, [
    gestureState.status,
    gestureState.ability,
    gestureState.shieldActive,
    isHost,
  ]);

  // Rematch consensus: once both players have voted, restart symmetrically
  useEffect(() => {
    if (
      !gameStarted &&
      gameWinner &&
      rematchVotes.host &&
      rematchVotes.joiner
    ) {
      setHostHP(100);
      setJoinerHP(100);
      hostHPRef.current = 100;
      joinerHPRef.current = 100;
      setGameWinner("");
      setGameStarted(true);
      setRematchVotes({ host: false, joiner: false });
    }
  }, [rematchVotes, gameStarted, gameWinner]);

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
    setHostHP(100);
    setJoinerHP(100);
    hostHPRef.current = 100;
    joinerHPRef.current = 100;
    setGameWinner("");
    setGameStarted(true);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "game_started" }));
    }
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
              {isHost && !gameStarted && (
                <button onClick={handleStartGame}>Start Game</button>
              )}
              {isHost && gameStarted && (
                <button className="btn-secondary" disabled>
                  Game in Progress
                </button>
              )}
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
            {gameWinner && !gameStarted && (
              <div className="game-over-overlay">
                <div className="game-over-banner">
                  {gameWinner === currentUser ? "You Win!" : "You Lose!"}
                </div>
                {(() => {
                  const myRole = isHost ? "host" : "joiner";
                  const myVoted = rematchVotes[myRole];
                  const readyCount =
                    (rematchVotes.host ? 1 : 0) + (rematchVotes.joiner ? 1 : 0);

                  return myVoted ? (
                    <p className="game-over-waiting">
                      Waiting for opponent... ({readyCount}/2)
                    </p>
                  ) : (
                    <button onClick={handleRematchClick}>Rematch</button>
                  );
                })()}
              </div>
            )}

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
              {/* Opponent ability icons render on this tile only when I am the joiner
                  (i.e. this host tile shows the opponent, from a joiner's perspective).
                  x is flipped (1 - x) to match the mirrored .video-tile__video display. */}
              {!isHost &&
                opponentCharge?.ability === "fireball" &&
                opponentFireballPos && (
                  <div
                    key={opponentCharge.startTime}
                    className="fireball-icon"
                    style={{
                      left: `${(1 - opponentFireballPos.x) * 100}%`,
                      top: `${opponentFireballPos.y * 100}%`,
                    }}
                  />
                )}
              {!isHost && opponentShieldActive && opponentShieldPos && (
                <div
                  className="shield-icon"
                  style={{
                    left: `${(1 - opponentShieldPos.x) * 100}%`,
                    top: `${opponentShieldPos.y * 100}%`,
                  }}
                />
              )}
              {/* My own ability icons render here only when I am the host
                  (this is my own tile in that case). */}
              {isHost &&
                gestureState.status === "charging" &&
                gestureState.ability === "fireball" &&
                myFireballPos && (
                  <div
                    key={myChargeStartTime}
                    className="fireball-icon"
                    style={{
                      left: `${(1 - myFireballPos.x) * 100}%`,
                      top: `${myFireballPos.y * 100}%`,
                    }}
                  />
                )}
              {isHost && gestureState.shieldActive && myShieldPos && (
                <div
                  className="shield-icon"
                  style={{
                    left: `${(1 - myShieldPos.x) * 100}%`,
                    top: `${myShieldPos.y * 100}%`,
                  }}
                />
              )}
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
              {/* Opponent ability icons render on this tile only when I am the host
                  (i.e. this joiner tile shows the opponent, from a host's perspective). */}
              {isHost &&
                opponentCharge?.ability === "fireball" &&
                opponentFireballPos && (
                  <div
                    key={opponentCharge.startTime}
                    className="fireball-icon"
                    style={{
                      left: `${(1 - opponentFireballPos.x) * 100}%`,
                      top: `${opponentFireballPos.y * 100}%`,
                    }}
                  />
                )}
              {isHost && opponentShieldActive && opponentShieldPos && (
                <div
                  className="shield-icon"
                  style={{
                    left: `${(1 - opponentShieldPos.x) * 100}%`,
                    top: `${opponentShieldPos.y * 100}%`,
                  }}
                />
              )}
              {/* My own ability icons render here only when I am the joiner
                  (this is my own tile in that case). */}
              {!isHost &&
                gestureState.status === "charging" &&
                gestureState.ability === "fireball" &&
                myFireballPos && (
                  <div
                    key={myChargeStartTime}
                    className="fireball-icon"
                    style={{
                      left: `${(1 - myFireballPos.x) * 100}%`,
                      top: `${myFireballPos.y * 100}%`,
                    }}
                  />
                )}
              {!isHost && gestureState.shieldActive && myShieldPos && (
                <div
                  className="shield-icon"
                  style={{
                    left: `${(1 - myShieldPos.x) * 100}%`,
                    top: `${myShieldPos.y * 100}%`,
                  }}
                />
              )}
              <div className="video-tile__hp">
                <div className="video-tile__hp-bar-bg">
                  <div
                    className="video-tile__hp-bar-fill"
                    style={{ width: `${joinerHP}%` }}
                  />
                </div>
                <span className="video-tile__hp-text">{joinerHP} / 100</span>
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
