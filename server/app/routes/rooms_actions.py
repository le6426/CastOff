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

def is_room_valid(room = None):
    if room is None:
        return False
    joined_user_id = room[1]
    if joined_user_id is not None:
        return False
    expires_at = room[3]
    current_time = datetime.now(timezone.utc)
    return current_time < expires_at

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