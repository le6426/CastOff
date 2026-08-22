'''
connect.py
'''
from fastapi import APIRouter, HTTPException, Cookie, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Annotated
from app.routes.auth_actions import *
from app.routes.rooms_actions import *
from app.routes.connect_actions import *
from typing import Dict, List


router = APIRouter()


# "room_id": [WebSocket1, WebSocket2]
rooms: Dict[str, List[WebSocket]] = {}

@router.websocket("/ws/{room_id}")
async def websocket_connect(websocket: WebSocket, room_id: str, session_id: Annotated[str | None, Cookie()] = None):
    await websocket.accept()
    session = await get_session_by_session_id_ws_helper(session_id, websocket)
    if not session:
        return
    
    user_id = session["session_userid"]
    room = get_room(room_id)

    if not room:
        await websocket.close(code=1000, reason="Room does not exist")
        return

    room_creator_id = room[0]
    room_joined_user_id = room[1]

    if user_id not in (room_creator_id, room_joined_user_id):
        await websocket.close(code=1000, reason="User not authorized for this room")
        return

    if room_id not in rooms:
        rooms[room_id] = []

    if len(rooms[room_id]) < 2:
        rooms[room_id].append(websocket)

    else:
        await websocket.close(code=1000, reason="Room is full")
        return

    try:
        while True:
            message = await websocket.receive_text()

            for connection in rooms[room_id]:
                if connection != websocket:
                    await connection.send_text(message)

    except WebSocketDisconnect:
        rooms[room_id].remove(websocket)

        if not rooms[room_id]:
            del rooms[room_id]