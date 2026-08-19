'''
users.py
'''
from app.config.database import get_connection
from datetime import datetime, timedelta, timezone

def get_user_by_username(username: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, password_hash FROM users WHERE username = %s",
                (username,)
            )
            return cur.fetchone()

def create_user(username: str, password_hash: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (username, password_hash) VALUES (%s, %s)",
                (username, password_hash)
            )
        conn.commit()

def get_password_hash_by_username(username: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT password_hash FROM users WHERE username = %s",
                (username,)
            )
            result = cur.fetchone()
            return result[0] if result else None

def get_user_id_by_username(username: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM users WHERE username = %s",
                (username,)
            )
            result = cur.fetchone()
            return result[0] if result else None

def create_session(user_id: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            current_time = datetime.now(timezone.utc)
            expiration_time = current_time + timedelta(minutes=15)
            cur.execute(
                "INSERT INTO sessions (user_id, created_at, expires_at) VALUES (%s, %s, %s) RETURNING id",
                (user_id, current_time, expiration_time)
            )
            session_id = cur.fetchone()[0]
        conn.commit()
    return session_id