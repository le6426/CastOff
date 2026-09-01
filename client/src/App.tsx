import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./App.css";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  // const [currentUser, setCurrentUser] = useState(null);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  let navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const response = await fetch(`${apiBaseUrl}/get_session`, {
        credentials: "include",
      });

      if (response.ok) {
        // const data = await response.json();
        // setCurrentUser(data.session_username);
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
      // console.log("Room ID:", room_id);

      navigate(`/room/${room_id}`);
    } else {
      console.log("error creating room");
    }
  };

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero__copy">
          <h1>Weave spells. Clash live. Claim victory.</h1>
          <p className="hero__subtext">
            Enter the arena, share your duel link, and unleash magic using
            real-time hand gestures.
          </p>
          <div className="landing__actions">
            {loggedIn ? (
              <button
                onClick={loggedIn ? handleCreateRoom : () => navigate("/login")}
              >
                Enter the Arena
              </button>
            ) : (
              <>
                <Link to="/register" className="btn-link btn-link--accent">
                  Join the Duel
                </Link>
                <Link to="/login" className="btn-link">
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="how">
        <ol className="how__list">
          <li>
            <span className="how__index">01</span>
            <div>
              <h3>Summon an Arena</h3>
              <p>Create a private battleground ready for 1v1 spellcasting.</p>
            </div>
          </li>
          <li>
            <span className="how__index">02</span>
            <div>
              <h3>Challenge a Rival</h3>
              <p>Send the duel link to an opponent.</p>
            </div>
          </li>
          <li>
            <span className="how__index">03</span>
            <div>
              <h3>Cast & Clash</h3>
              <p>
                Enable your camera, use somatic hand gestures, and battle using
                real-time computer vision.
              </p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}

export default App;
