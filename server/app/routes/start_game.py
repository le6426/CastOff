'''
start_game.py
'''
from fastapi import APIRouter, HTTPException, Cookie, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Annotated
from app.routes.auth_actions import *
from app.routes.rooms_actions import *
import random

router = APIRouter()

@router.get("/start_game/{room_id}")
def start_game(room_id: str):
    host_score = random.randint(1, 10)
    joiner_score = random.randint(1, 10)
    return {"host_score": host_score, "joiner_score": joiner_score}