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

  // Video element refs
  const hostVideoRef = useRef<HTMLVideoElement | null>(null);
  const joinerVideoRef = useRef<HTMLVideoElement | null>(null);
  // Ref to store local stream so WebRTC can access it later
  const localStreamRef = useRef<MediaStream | null>(null);

  const isInitializingRef = useRef(false);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL;

  let params = useParams();
  const roomID = params.roomID;
  //   console.log("ROOM ID:", roomID);

  useEffect(() => {
    const initializeRoom = async () => {
      if (!roomID || isInitializingRef.current) return;
      isInitializingRef.current = true;

      try {
        // 1. Get session
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

        // 2. Fetch room details
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

        // 3. AWAIT joining if the user is not the host
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

  // 2. Capture Camera & Microphone Media Stream
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

  useEffect(() => {
    if (!roomID || !readyForConnection) return;

    var ws = new WebSocket(`${wsBaseUrl}/ws/${roomID}`);

    ws.onopen = () => {
      console.log("Connected!");
      ws.send("Test message");
    };
    ws.onmessage = (event) => console.log("Received:", event.data);
    ws.onclose = (event) =>
      console.log(`Closed (${event.code}): ${event.reason}`);

    return () => {
      ws.close();
    };
  }, [readyForConnection]);

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
