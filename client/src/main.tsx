import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import Register from "./Register.tsx";
import Login from "./Login.tsx";
import NotFoundPage from "./NotFoundPage.tsx";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import Nav from "./components/Navbar.tsx";
import Room from "./Room.tsx";

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
