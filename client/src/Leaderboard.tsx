import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./Leaderboard.css";

interface LeaderboardEntry {
  username: string;
  elo: number;
}

const Leaderboard = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/leaderboard`);
        if (!response.ok) {
          throw new Error("Failed to load leaderboard");
        }
        const data = await response.json();
        setEntries(data);
      } catch (err) {
        console.error(err);
        setError("Could not load the leaderboard. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboard();
  }, [apiBaseUrl]);

  return (
    <div className="leaderboard">
      <div className="leaderboard__header">
        <h1>Leaderboard</h1>
        <button>
          <Link to="/" className="btn-secondary">
            Back to Home
          </Link>
        </button>
      </div>

      {isLoading && <p className="leaderboard__status">Loading...</p>}
      {error && <p className="leaderboard__error">{error}</p>}

      {!isLoading && !error && (
        <table className="leaderboard__table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Username</th>
              <th>Elo</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={3} className="leaderboard__status">
                  No players yet.
                </td>
              </tr>
            ) : (
              entries.map((entry, index) => (
                <tr key={entry.username}>
                  <td>{index + 1}</td>
                  <td>{entry.username}</td>
                  <td>{entry.elo}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Leaderboard;
