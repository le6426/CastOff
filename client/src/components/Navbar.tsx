// Navbar.tsx

import { useState, useEffect, useContext } from "react";
import { SessionContext } from "../main";
import { Link, useNavigate } from "react-router-dom";
import "./Navbar.css";

const Navbar = () => {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Navbar must be used within SessionContext");

  const { loggedIn, setLoggedIn, currentUser, setCurrentUser } = session;
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const navigate = useNavigate();

  const handleLogOut = async () => {
    setCurrentUser(null);
    setLoggedIn(false);
    navigate("/");

    try {
      await fetch(`${apiBaseUrl}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout request failed", error);
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
