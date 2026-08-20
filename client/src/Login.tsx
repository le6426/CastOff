import { useRef, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Register.css";

const Login = () => {
  const userRef = useRef<HTMLInputElement>(null);
  const errRef = useRef<HTMLParagraphElement>(null);

  const [user, setUser] = useState("");

  const [pwd, setPwd] = useState("");

  const [errMsg, setErrMsg] = useState("");

  let navigate = useNavigate();

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  useEffect(() => {
    setErrMsg("");
  }, [user, pwd]);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

    try {
      const response = await fetch(`${apiBaseUrl}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: user, password: pwd }),
        credentials: "include",
      });

      // console.log("Response:", response);

      if (response.ok) {
        navigate("/");
      } else {
        const responseDetails = await response.json();
        setErrMsg(responseDetails.detail);
      }
    } catch (error) {
      setErrMsg("No response from server");
    }
  };

  return (
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

        <button disabled={user && pwd ? false : true}>Log In</button>
      </form>
      <div>
        Don't have an account?
        <button>
          <Link to="/register">Register</Link>
        </button>
      </div>
      <br />
      <button>
        <Link to="/">Go to Home</Link>
      </button>
    </section>
  );
};

export default Login;
