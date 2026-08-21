'''
rooms.py
'''
from fastapi import APIRouter, HTTPException, Cookie, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Annotated
from app.routes.auth_actions import *
from app.routes.rooms_actions import *

router = APIRouter()

@router.post("/create_room")
def make_room(session_id: Annotated[str | None, Cookie()] = None):
    session = get_session_by_session_id_helper(session_id)
    user_id = session["session_userid"]
    room_id = create_room(user_id)
    return {"room_id": room_id}