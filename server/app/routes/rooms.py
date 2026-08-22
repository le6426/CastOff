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

@router.post("/join_room/{room_id}")
def join_room(room_id: str, session_id: Annotated[str | None, Cookie()] = None):
    session = get_session_by_session_id_helper(session_id)
    user_id = session["session_userid"]
    room = get_room(room_id)

    if not is_room_valid(room):
        raise HTTPException(status_code=404, detail="Room doesn't exist or is expired")

    if not is_room_not_full(room):
        raise HTTPException(status_code=400, detail="Room is full")

    creator_id = room[0]

    if creator_id == user_id:
        raise HTTPException(status_code=404, detail="Can not join your own room")

    join_room_action(room_id, user_id)
    return {"message": "Successfully joined room",
            "room_id": room_id,            
            }

@router.get("/room/{room_id}")
def get_room_route(room_id: str):
    room = get_room(room_id)

    if not is_room_valid(room):
        raise HTTPException(status_code=404, detail="Room is full or expired")
    
    return {"creator_id": room[0],
            "creator_user": get_username_by_user_id(room[0]),
            "joined_user_id": room[1], 
            "created_at": room[2], 
            "expires_at": room[3]}

@router.post("/leave_room/{room_id}")
def leave_room(room_id: str, session_id: Annotated[str | None, Cookie()] = None):
    session = get_session_by_session_id_helper(session_id)
    user_id = session["session_userid"]
    room = get_room(room_id)

    delete_columnn_message = delete_user_column(room_id, user_id, room)
    delete_room_message = delete_room_if_empty(room_id)

    return {"delete_columnn_message": delete_columnn_message, 
            "delete_room_message": delete_room_message}