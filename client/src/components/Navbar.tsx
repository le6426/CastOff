// Navbar.tsx

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./Navbar.css";

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
        setCurrentUser(data.session_username);
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
    <nav className="navbar">
      <Link to="/" className="navbar__brand">
        CastOff
      </Link>
      <ul className="navbar__menu">
        <li>
          {loggedIn ? (
            <span className="navbar__user">
              Logged in as <strong>{currentUser}</strong>
            </span>
          ) : (
            <Link to="/login" className="navbar__link">
              Log In
            </Link>
          )}
        </li>
        <li>
          {loggedIn ? (
            <button className="btn-secondary btn-small" onClick={handleLogOut}>
              Log Out
            </button>
          ) : (
            <Link to="/register" className="navbar__link navbar__link--accent">
              Register
            </Link>
          )}
        </li>
      </ul>
    </nav>
  );
};

export default Navbar;
