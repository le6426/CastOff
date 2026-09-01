import { useState, useContext } from "react";
import { SessionContext } from "./main";
import { useNavigate, Link } from "react-router-dom";
import "./App.css";

function App() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("App must be used within SessionContext");

  const { loggedIn, currentUser } = session;
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const navigate = useNavigate();

  console.log("Current User:", currentUser);

  const [isCreating, setIsCreating] = useState(false);

  const handleCreateRoom = async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      const create_room_response = await fetch(`${apiBaseUrl}/create_room`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (create_room_response.ok) {
        const create_room_data = await create_room_response.json();
        const room_id = create_room_data["room_id"];
        navigate(`/room/${room_id}`);
      } else {
        console.error("Failed to create room: Server returned error status");
      }
    } catch (error) {
      console.error("Network error while creating room:", error);
    } finally {
      setIsCreating(false);
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
                onClick={handleCreateRoom}
                disabled={isCreating}
                className="btn-primary"
              >
                {isCreating ? "Summoning Arena..." : "Enter the Arena"}
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
              <p>
                One click creates a private battleground ready for 1v1
                spellcasting.
              </p>
            </div>
          </li>
          <li>
            <span className="how__index">02</span>
            <div>
              <h3>Challenge a Rival</h3>
              <p>
                Send the duel link to an opponent via message, Discord, or chat.
              </p>
            </div>
          </li>
          <li>
            <span className="how__index">03</span>
            <div>
              <h3>Cast & Clash</h3>
              <p>
                Enable your camera, use somatic hand gestures, and battle in
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
