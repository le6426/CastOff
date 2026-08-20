// Navbar.tsx

import { useRef, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

const Navbar = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    const checkSession = async () => {
      const response = await fetch(`${apiBaseUrl}/get_session`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.session_user);
        setLoggedIn(true);
      } else {
        console.log("No response from server"); // for dev
      }
    };
    checkSession();
  }, []);

  const handleLogOut = async () => {
    try {
      await fetch(`${apiBaseUrl}/logout`, {
        method: "POST",
        credentials: "include",
      });
      setCurrentUser(null);
      setLoggedIn(false);
      window.location.href = "/";
    } catch (error) {
      console.log("No response from server");
    }
  };

  return (
    <nav className="bg-slate-800">
      <div className="nav-brand">MyApp</div>
      <ul className="nav-menu">
        <li>
          {loggedIn ? (
            <a>Logged in as: {currentUser}</a>
          ) : (
            <button>
              <Link to="/login">Log In</Link>
            </button>
          )}
        </li>
        <li>
          {loggedIn ? (
            <button onClick={handleLogOut}>Log Out</button>
          ) : (
            <button>
              <Link to="/register">Register</Link>
            </button>
          )}
        </li>
      </ul>
    </nav>
  );
};

export default Navbar;
