'''
match_result.py
'''
from fastapi import APIRouter, HTTPException, Cookie, Depends
from pydantic import BaseModel
from typing import Annotated
from app.routes.auth_actions import *
from app.routes.rooms_actions import *
from app.routes.elo_actions import *

router = APIRouter()


class MatchResultRequest(BaseModel):
    winner_username: str


@router.post("/report_match_result/{room_id}")
def report_match_result(
    room_id: str,
    body: MatchResultRequest,
    session_id: Annotated[str | None, Cookie()] = None,
):
    session = get_session_by_session_id_helper(session_id)
    session_user_id = session["session_userid"]

    room = get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    creator_id, joined_user_id, _, _ = room

    # Only the host may report a result — prevents both clients from
    # each independently reporting the same match (double-counting) and
    # prevents a non-host from reporting on the host's behalf.
    if session_user_id != creator_id:
        raise HTTPException(
            status_code=403,
            detail="Only the host can report a match result",
        )

    if not joined_user_id:
        raise HTTPException(status_code=400, detail="Room has no joiner")

    winner_id = get_user_id_by_username(body.winner_username)
    if winner_id is None:
        raise HTTPException(status_code=404, detail="Winner not found")

    if winner_id == creator_id:
        loser_id = joined_user_id
    elif winner_id == joined_user_id:
        loser_id = creator_id
    else:
        raise HTTPException(
            status_code=400,
            detail="Winner is not a participant in this room",
        )

    new_winner_elo, new_loser_elo = apply_match_result(winner_id, loser_id)

    return {
        "winner_id": winner_id,
        "loser_id": loser_id,
        "winner_elo": new_winner_elo,
        "loser_elo": new_loser_elo,
    }


@router.get("/leaderboard")
def leaderboard(limit: int = 50):
    rows = get_leaderboard(limit)
    return [{"username": username, "elo": elo} for username, elo in rows]
