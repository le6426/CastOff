'''
auth.py
'''
from fastapi import APIRouter, HTTPException, Cookie, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Annotated
import bcrypt
from app.routes.auth_actions import *

router = APIRouter()

class AuthorizationRequest(BaseModel):
    username: str
    password: str

@router.post("/register")
def register_user(payload: AuthorizationRequest):
    user = get_user_by_username(payload.username)
    if user:
        raise HTTPException(status_code=400, detail="Username already taken")

    password_bytes = payload.password.encode("utf-8")
    hashed_password = bcrypt.hashpw(password_bytes, bcrypt.gensalt())

    create_user(payload.username, hashed_password.decode("utf-8"))

    return {"message": "User registered successfully"}

@router.post("/login")
def login_user(payload: AuthorizationRequest):
    hashed_password = get_password_hash_by_username(payload.username)

    if hashed_password is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if bcrypt.checkpw(payload.password.encode("utf-8"), hashed_password.encode("utf-8")):
        user_id = get_user_id_by_username(payload.username)
        session_id = create_session(user_id)
        response = JSONResponse(content={"message": "Login successful"})
        response.set_cookie(key="session_id", value=str(session_id), httponly=True)
        return response
    else:
        raise HTTPException(status_code=401, detail="Invalid username or password")

@router.get("/read_cookie") # for dev
def read_cookie(session_id: Annotated[str | None, Cookie()] = None):
    return {"session_id": session_id}


@router.get("/get_session")
def get_session(session_id: Annotated[str | None, Cookie()] = None):
    return get_session_by_session_id_helper(session_id)

@router.post("/logout")
def logout_user(session_id: Annotated[str | None, Cookie()] = None):

    if session_id is None:
       raise HTTPException(status_code=401, detail="Session already expired")
    
    response = JSONResponse(content={"message": "Logout successful"})
    response.delete_cookie(key="session_id", httponly=True)
    delete_session(session_id)
    return response
