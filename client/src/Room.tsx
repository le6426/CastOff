import { useEffect, useState, useRef, useContext } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { SessionContext } from "./main";
import "./Room.css";

const Room = () => {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Room must be used within SessionContext");

  const { loggedIn, currentUser } = session;
  const navigate = useNavigate();

  const [roomCreatorUser, setRoomCreatorUser] = useState(``);
  const [roomJoinerUser, setRoomJoinerUser] = useState(``);
  const [isHost, setIsHost] = useState(false);
  const [inviteLink, setInviteLink] = useState(``);
  const [joinError, setJoinError] = useState(``);
  const [readyForConnection, setReadyForConnection] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [hostScore, setHostScore] = useState(0);
  const [joinerScore, setJoinerScore] = useState(0);
  const [gameWinner, setGameWinner] = useState(``);

  // Video element refs
  const hostVideoRef = useRef<HTMLVideoElement | null>(null);
  const joinerVideoRef = useRef<HTMLVideoElement | null>(null);
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
  }, [roomID, loggedIn, currentUser, apiBaseUrl]);

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
        else if (data.type === "game_results") {
          setHostScore(data.hostScore);
          setJoinerScore(data.joinerScore);
          setGameWinner(data.winner);
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
    const startGame = async () => {
      const start_game_response = await fetch(
        `${apiBaseUrl}/start_game/${roomID}`,
      );
      const start_data = await start_game_response.json();
      if (start_game_response.ok) {
        console.log("HOST SCORE:", start_data.host_score);
        console.log("JOINER SCORE:", start_data.joiner_score);

        const { host_score, joiner_score } = start_data;

        setHostScore(host_score);
        setJoinerScore(joiner_score);

        let winner = "Tie";
        if (host_score < joiner_score) {
          winner = roomJoinerUser;
        } else if (host_score > joiner_score) {
          winner = roomCreatorUser;
        }
        setGameWinner(winner);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "game_results",
              hostScore: host_score,
              joinerScore: joiner_score,
              winner: winner,
            }),
          );
        }
      }
    };
    startGame();
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
            <div className="video-tile">
              <video
                ref={hostVideoRef}
                autoPlay
                playsInline
                muted={isHost}
                className="video-tile__video"
              />
              <div className="video-tile__overlay">
                <span className="video-tile__name">
                  {roomCreatorUser} (Host)
                </span>
                <span className="video-tile__score">Score: {hostScore}</span>
              </div>
            </div>
            <div className="video-tile">
              <video
                ref={joinerVideoRef}
                autoPlay
                playsInline
                muted={!isHost}
                className="video-tile__video"
              />
              <div className="video-tile__overlay">
                <span className="video-tile__name">
                  {roomJoinerUser || "Waiting for joiner..."}
                </span>
                <span className="video-tile__score">Score: {joinerScore}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Room;
