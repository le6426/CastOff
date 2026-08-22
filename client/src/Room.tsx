import { useEffect, useState } from "react";
import "./App.css";
import { Link, useParams } from "react-router-dom";

const Room = () => {
  // const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(``);
  const [roomCreatorUser, setRoomCreatorUser] = useState(``);
  // const [currentUserID, setCurrentUserID] = useState(``);
  // const [roomCreatorID, setRoomCreatorID] = useState(``);
  const [isHost, setIsHost] = useState(false);
  const [inviteLink, setInviteLink] = useState(``);
  const [joinError, setJoinError] = useState(``);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  let params = useParams();
  const roomID = params.roomID;
  //   console.log("ROOM ID:", roomID);

  useEffect(() => {
    const initializeRoom = async () => {
      const get_session_response = await fetch(`${apiBaseUrl}/get_session`, {
        credentials: "include",
      });

      if (get_session_response.ok) {
        const session_data = await get_session_response.json();
        setCurrentUser(session_data.session_username);
        // setCurrentUserID(session_data.session_userid);
        // setLoggedIn(true);

        if (roomID) {
          const checkRoom = async (currentUserID: string) => {
            const get_room_response = await fetch(
              `${apiBaseUrl}/room/${roomID}`,
            );

            if (get_room_response.ok) {
              const room_data = await get_room_response.json();
              // setRoomCreatorID(room_data.creator_id);
              setRoomCreatorUser(room_data.creator_user);
              setIsHost(currentUserID == room_data.creator_id);
              setInviteLink(`${window.location.origin}/room/${roomID}`);

              // if current user isn't the creator, then proceed with joining
              if (currentUserID != room_data.creator_id) {
                const joinRoomIfJoiner = async () => {
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
                  }
                };
                joinRoomIfJoiner();
              }
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
          <div>{<span>{joinError}</span>}</div>
        </div>
      )}
    </>
  );
};

export default Room;
