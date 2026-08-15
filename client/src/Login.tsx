import { useRef, useState, useEffect } from "react";
import {
  faCheck,
  faTimes,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "react-router-dom";

const Login = () => {
  return (
    <div>
      <h1>This is the Login Page</h1>
      <button>
        <Link to="/">Go to Home</Link>
      </button>
    </div>
  );
};

export default Login;
