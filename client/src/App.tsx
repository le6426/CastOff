import { useState } from "react";
import "./App.css";
import Register from "./Register.tsx";
import Login from "./Login.tsx";
import { Link } from "react-router-dom";

function App() {
  return (
    <>
      <h1>This is the Landing Page</h1>
      <button>
        <Link to="/login">Login</Link>
      </button>
      <br />
      <button>
        <Link to="/register">Register</Link>
      </button>
    </>
  );
}

export default App;
