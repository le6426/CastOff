import { StrictMode, useState, useEffect, createContext } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import { Analytics } from "@vercel/analytics/next";
import App from "./App.tsx";
import Register from "./Register.tsx";
import Login from "./Login.tsx";
import NotFoundPage from "./NotFoundPage.tsx";
import Nav from "./components/Navbar.tsx";
import Room from "./Room.tsx";

interface SessionContextType {
  loggedIn: boolean;
  setLoggedIn: Dispatch<SetStateAction<boolean>>;
  currentUser: string | null;
  setCurrentUser: Dispatch<SetStateAction<string | null>>;
  isAuthLoading: boolean; // Add this
}

export const SessionContext = createContext<SessionContextType | undefined>(
  undefined,
);

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

function LayoutComponent() {
  return (
    <div>
      <header>
        <Nav />
      </header>
      <main>
        <Outlet />
      </main>
      <footer></footer>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <LayoutComponent />,
    children: [
      {
        index: true,
        element: <App />,
      },
      {
        path: "/register",
        element: <Register />,
      },
      {
        path: "/login",
        element: <Login />,
      },
    ],
  },
  {
    path: "/room/:roomID",
    element: <Room />,
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

function RootApp() {
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/get_session`, {
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          setCurrentUser(data.session_username);
          setLoggedIn(true);
        }
      } catch (error) {
        console.error("Failed to check session", error);
      } finally {
        setIsAuthLoading(false); // Finished checking
      }
    };

    checkSession();
  }, []);

  return (
    <SessionContext.Provider
      value={{
        loggedIn,
        setLoggedIn,
        currentUser,
        setCurrentUser,
        isAuthLoading,
      }}
    >
      <RouterProvider router={router} />
    </SessionContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootApp />
    <Analytics />
  </StrictMode>,
);
