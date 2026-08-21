'''
rooms.py
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