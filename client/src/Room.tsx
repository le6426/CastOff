import { useEffect, useState, useRef } from "react";
import "./App.css";
import { Link, useParams } from "react-router-dom";

const Room = () => {
  const [currentUser, setCurrentUser] = useState(``);
  const [roomCreatorUser, setRoomCreatorUser] = useState(``);
  const [isHost, setIsHost] = useState(false);
  const [inviteLink, setInviteLink] = useState(``);
  const [joinError, setJoinError] = useState(``);
  const [readyForConnection, setReadyForConnection] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);

  // Video element refs
  const hostVideoRef = useRef<HTMLVideoElement | null>(null);
  const joinerVideoRef = useRef<HTMLVideoElement | null>(null);
  // Ref to store local stream so WebRTC can access it later
  const localStreamRef = useRef<MediaStream | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const isInitializingRef = useRef(false);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL;
  const stunServer1 = import.meta.env.VITE_STUN_SERVER_1;

  let params = useParams();
  const roomID = params.roomID;
  //   console.log("ROOM ID:", roomID);

  useEffect(() => {
    const initializeRoom = async () => {
      if (!roomID || isInitializingRef.current) return;
      isInitializingRef.current = true;

      try {
        // Get session
        const get_session_response = await fetch(`${apiBaseUrl}/get_session`, {
          credentials: "include",
        });

        if (!get_session_response.ok) {
          const errorData = await get_session_response.json();
          setJoinError(errorData.detail);
          return;
        }

        const session_data = await get_session_response.json();
        setCurrentUser(session_data.session_username);
        const currentUserID = session_data.session_userid;

        // Fetch room details
        const get_room_response = await fetch(`${apiBaseUrl}/room/${roomID}`);

        if (!get_room_response.ok) {
          const errorData = await get_room_response.json();
          setJoinError(errorData.detail);
          return;
        }

        const room_data = await get_room_response.json();
        setRoomCreatorUser(room_data.creator_user);
        const hostCheck = currentUserID === room_data.creator_id;
        setIsHost(hostCheck);
        setInviteLink(`${window.location.origin}/room/${roomID}`);

        // AWAIT joining if the user is not the host
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
            setJoinError(errorData.detail);
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
  }, [roomID]);

  // Capture Camera & Microphone Media Stream
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

    // Cleanup: Turn off camera & mic hardware when leaving room
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [readyForConnection, isHost]);

  // Setup RTCPeerConnection and WebSocket in a single lifecycle
  useEffect(() => {
    if (!roomID || !readyForConnection || !isMediaReady) return;

    // 1. Instantiate Peer Connection
    const rtcConfig = {
      iceServers: [{ urls: stunServer1 }],
    };
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;

    // 2. Attach local media tracks BEFORE handling any signaling
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // 3. Set up remote track handler
    pc.ontrack = (event) => {
      console.log("📥 Received remote track:", event.streams[0]);
      if (isHost && joinerVideoRef.current) {
        joinerVideoRef.current.srcObject = event.streams[0];
      } else if (!isHost && hostVideoRef.current) {
        hostVideoRef.current.srcObject = event.streams[0];
      }
    };

    // 4. Connect WebSocket after PC is fully prepared
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
          console.log("⚡ Host creating offer with local tracks...");
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({ type: "offer", sdp: offer }));
        }

        // JOINER: Respond to incoming offer
        else if (data.type === "offer" && !isHost) {
          console.log(
            "📥 Joiner received offer, setting remote description...",
          );
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

          console.log("⚡ Joiner creating answer with local tracks...");
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: "answer", sdp: answer }));
        }

        // HOST: Process answer from Joiner
        else if (data.type === "answer" && isHost) {
          console.log("📥 Host received answer!");
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }

        // BOTH: Add remote ICE candidate
        else if (data.type === "candidate") {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
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
      const leave_room_response = await fetch(
        `${apiBaseUrl}/leave_room/${roomID}`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (leave_room_response.ok) {
        window.location.href = "/";
      } else {
        const errorData = await leave_room_response.json();
        setJoinError(errorData.detail);
      }
    };
    leaveRoom();
  };

  return (
    <>
      {joinError ? (
        <div>
          <a>{joinError}</a>
          <br />
          <button>
            <Link to="/">Go to Home</Link>
          </button>
        </div>
      ) : (
        <div>
          <h1>This is a room</h1>
          <div>
            {isHost ? (
              <span>You are the host</span>
            ) : (
              <span>You are the joiner</span>
            )}
          </div>
          <div>Current Host: {roomCreatorUser}</div>
          <div>Current user: {currentUser}</div>
          <div>{isHost ? <span>Invite link: {inviteLink}</span> : null}</div>
          <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
            <div>
              <h3>Host Video</h3>
              <video
                ref={hostVideoRef}
                autoPlay
                playsInline
                muted={isHost} // Mute if this user is the host to prevent audio echo
                style={{ width: "320px", background: "#000" }}
              />
            </div>
            <div>
              <h3>Joiner Video</h3>
              <video
                ref={joinerVideoRef}
                autoPlay
                playsInline
                muted={!isHost} // Mute if this user is the joiner to prevent audio echo
                style={{ width: "320px", background: "#000" }}
              />
            </div>
          </div>
          <button>
            <Link to="/">Go to Home</Link>
          </button>
          <button onClick={handleLeaveRoom}>Leave Room</button>
        </div>
      )}
    </>
  );
};

export default Room;
