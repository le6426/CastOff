'''
rooms_actions.py
SQL inquieries for rooms
'''
from app.config.database import get_connection
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Cookie, Depends

def create_room(creator_id: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            current_time = datetime.now(timezone.utc)
            expiration_time = current_time + timedelta(minutes=15)
            cur.execute(
                "INSERT INTO rooms (creator_id, created_at, expires_at) VALUES (%s, %s, %s) RETURNING id",
                (creator_id, current_time, expiration_time)
            )
            room_id = cur.fetchone()[0]
        conn.commit()
    return room_id

def get_room(room_id: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT creator_id, joined_user_id, created_at, expires_at FROM rooms WHERE id = %s",
                (room_id,)
            )
            return cur.fetchone()

# Checks for existence, and expiration
def is_room_valid(room = None):
    if room is None:
        return False
    expires_at = room[3]
    current_time = datetime.now(timezone.utc)
    return current_time < expires_at

# Checks for just fullness
def is_room_not_full(room = None):
    joined_user_id = room[1]
    if joined_user_id is not None:
        return False
    return True

def join_room_action(room_id: str, joiner_id: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE rooms SET joined_user_id = %s WHERE id = %s RETURNING id",
                (joiner_id, room_id)
            )
            room_id = cur.fetchone()[0]
        conn.commit()
    return room_id


def delete_user_column(room_id: str, user_id: str, room=None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            message = "Column successfully deleted"
            if not room:
                return "Room does not exist"
            creator_id = room[0]
            joined_user_id = room[1]
            if user_id == creator_id:
                cur.execute(
                    "UPDATE rooms SET creator_id = NULL WHERE id = %s",
                    (room_id,)
                )
            elif user_id == joined_user_id:
                cur.execute(
                    "UPDATE rooms SET joined_user_id = NULL WHERE id = %s",
                    (room_id,)
                )
            else:
                message = "User not in the room"
        conn.commit()
    return message

def delete_room_if_empty(room_id: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT creator_id, joined_user_id FROM rooms WHERE id = %s",
                (room_id,)
            )
            creator_id, joined_user_id = cur.fetchone()
            message = "Could not delete room because it wasn't empty"

            if (not creator_id) and (not joined_user_id):
                cur.execute(
                    "DELETE FROM rooms WHERE id = %s RETURNING id",
                    (room_id,)
                )
                message = "Room successfully deleted"
        conn.commit()
    return message