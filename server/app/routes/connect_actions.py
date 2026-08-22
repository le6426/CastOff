'''
connect_actions.py
SQL inquieries for rooms
'''
from app.config.database import get_connection
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Cookie, Depends, WebSocket
from app.routes.auth_actions import *
from app.routes.rooms_actions import *

async def get_session_by_session_id_ws_helper(session_id, websocket):
    session = get_session_by_session_id(session_id)

    if session is None:
        await websocket.close(code=1000, reason="User not in the room")
        return

    if not is_session_valid(session):
        delete_session(session_id)
        await websocket.close(code=1000, reason="User not in the room")
        return

    return {"session_userid": session[0],
            "session_username": get_username_by_user_id(session[0]),
             "created_at": session[1], 
             "expires_at": session[2]}