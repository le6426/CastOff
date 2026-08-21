import { useEffect, useState } from "react";
import "./App.css";
import { Link, useParams } from "react-router-dom";

const Room = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserID, setCurrentUserID] = useState(null);
  const [roomCreatorID, setRoomCreatorID] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [isJoiner, setIsJoiner] = useState(null);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  let params = useParams();
  const roomID = params.roomID;
  //   console.log("ROOM ID:", roomID);

  useEffect(() => {
    const initializeRoom = async () => {
      const response = await fetch(`${apiBaseUrl}/get_session`, {
        credentials: "include",
      });

      if (response.ok) {
        const session_data = await response.json();
        setCurrentUser(session_data.session_username);
        setCurrentUserID(session_data.session_userid);
        setLoggedIn(true);

        if (roomID) {
          const checkRoom = async (currentUserID: string) => {
            const response = await fetch(`${apiBaseUrl}/room/${roomID}`, {});

            if (response.ok) {
              const room_data = await response.json();
              setRoomCreatorID(room_data.creator_id);
              setIsHost(currentUserID == room_data.creator_id);
            }
          };
          checkRoom(session_data.session_userid);
        }
      } else {
        console.log("No response from server"); // for dev
      }
    };
    initializeRoom();
  }, []);

  //   setIsHost(currentUserID == roomCreatorID);

  return (
    <div>
      <h1>This is a room</h1>
      <div>{loggedIn ? <a></a> : <a></a>}</div>
      <button>
        <Link to="/">Go to Home</Link>
      </button>
    </div>
  );
};

export default Room;
