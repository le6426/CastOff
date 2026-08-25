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
