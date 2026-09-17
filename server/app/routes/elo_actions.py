'''
elo_actions.py
SQL queries for user Elo ratings and the leaderboard
'''
from app.config.database import get_connection


def get_elo_by_user_id(user_id: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT elo FROM users WHERE id = %s",
                (user_id,)
            )
            result = cur.fetchone()
            return result[0] if result else None


def apply_match_result(winner_id: str, loser_id: str):
    """
    Winner gains 10, loser loses 10 (clamped at 0 via GREATEST so it never
    goes negative, matching the users.elo CHECK constraint). Returns the
    two updated values.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET elo = elo + 10 WHERE id = %s RETURNING elo",
                (winner_id,)
            )
            new_winner_elo = cur.fetchone()[0]

            cur.execute(
                "UPDATE users SET elo = GREATEST(elo - 10, 0) WHERE id = %s RETURNING elo",
                (loser_id,)
            )
            new_loser_elo = cur.fetchone()[0]
        conn.commit()
    return new_winner_elo, new_loser_elo


def get_leaderboard(limit: int = 50):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT username, elo FROM users ORDER BY elo DESC, username ASC LIMIT %s",
                (limit,)
            )
            return cur.fetchall()
