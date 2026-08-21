import { useEffect, useState } from "react";
import "./App.css";
import { Link, useParams } from "react-router-dom";

const Room = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  let params = useParams();
  const roomURL = params.roomID;
  console.log("ROOM ID:", roomURL);

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
