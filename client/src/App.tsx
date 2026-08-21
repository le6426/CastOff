import { useEffect, useState } from "react";
import "./App.css";
import Register from "./Register.tsx";
import Login from "./Login.tsx";
import { Link } from "react-router-dom";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [roomURL, setRoomURL] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    const checkSession = async () => {
      const response = await fetch(`${apiBaseUrl}/get_session`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.session_username);
        setLoggedIn(true);
      } else {
        console.log("No response from server"); // for dev
      }
    };
    checkSession();
  }, []);

  const handleCreateRoom = async () => {
    const create_room_response = await fetch(`${apiBaseUrl}/create_room`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (create_room_response.ok) {
      // window.location.href = "/";
      const create_room_data = await create_room_response.json();
      const room_id = create_room_data["room_id"];
      console.log("Room ID:", room_id);
    } else {
      console.log("error creating room");
    }
  };

  return (
    <>
      <h1>This is the Landing Page</h1>
      <div>
        {loggedIn ? (
          <button onClick={handleCreateRoom}>Create Room</button>
        ) : null}
      </div>
    </>
  );
}

export default App;
