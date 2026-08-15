import { Link } from "react-router-dom";

const NotFoundPage = () => {
  return (
    <div>
      <h1>Page Not Found</h1>
      <button>
        <Link to="/">Go to Home</Link>
      </button>
    </div>
  );
};

export default NotFoundPage;
