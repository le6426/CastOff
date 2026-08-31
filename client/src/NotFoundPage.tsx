import { Link } from "react-router-dom";
import "./NotFoundPage.css";

const NotFoundPage = () => {
  return (
    <div className="not-found">
      <h1>Page Not Found</h1>
      <button>
        <Link to="/">Go to Home</Link>
      </button>
    </div>
  );
};

export default NotFoundPage;
