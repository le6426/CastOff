import { useRef, useState, useEffect, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SessionContext } from "./main";
import "./Login.css";

const Login = () => {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Login must be used within SessionContext");

  const { setLoggedIn, setCurrentUser } = session;
  const navigate = useNavigate();

  const userRef = useRef<HTMLInputElement>(null);
  const errRef = useRef<HTMLParagraphElement>(null);

  const [user, setUser] = useState("");
  const [pwd, setPwd] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  useEffect(() => {
    setErrMsg("");
  }, [user, pwd]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

    try {
      setIsLoggingIn(true);

      const response = await fetch(`${apiBaseUrl}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: user, password: pwd }),
        credentials: "include",
      });

      if (response.ok) {
        const responseData = await response.json();
        setCurrentUser(responseData.session_username || user);
        setLoggedIn(true);
        navigate("/");
      } else {
        const responseDetails = await response.json();
        setErrMsg(responseDetails.detail || "Invalid credentials");
      }
    } catch (error) {
      setErrMsg("No response from server");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <section>
          <p
            ref={errRef}
            className={errMsg ? "errmsg" : "offscreen"}
            aria-live="assertive"
          >
            {errMsg}
          </p>
          <h1>Log In</h1>
          <form onSubmit={handleSubmit}>
            <label htmlFor="username">Username:</label>
            <input
              type="text"
              id="username"
              ref={userRef}
              autoComplete="off"
              onChange={(e) => setUser(e.target.value)}
              value={user}
              required
            />

            <label htmlFor="password">Password:</label>
            <input
              type="password"
              id="password"
              onChange={(e) => setPwd(e.target.value)}
              value={pwd}
              required
            />

            <button disabled={!user || !pwd || isLoggingIn} type="submit">
              {isLoggingIn ? "Logging in..." : "Log In"}
            </button>
          </form>

          <div className="switch">
            Don't have an account?{" "}
            <Link to="/register" className="btn-link">
              Register
            </Link>
          </div>
          <br />
          <Link to="/" className="btn-link">
            Go to Home
          </Link>
        </section>
      </div>
    </div>
  );
};

export default Login;
