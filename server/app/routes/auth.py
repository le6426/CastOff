'''
auth.py
'''
from fastapi import APIRouter, HTTPException, Cookie
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Annotated
import bcrypt
from app.routes.users import get_user_by_username, create_user, get_password_hash_by_username, get_user_id_by_username, create_session

router = APIRouter()

class AuthorizationRequest(BaseModel):
    username: str
    password: str

@router.post("/register")
def register_user(payload: AuthorizationRequest):
    user = get_user_by_username(payload.username)
    if user:
        raise HTTPException(status_code=400, detail="Username already taken")

    # bcrypt works with bytes, not strings — so we encode the password first
    password_bytes = payload.password.encode("utf-8")
    hashed_password = bcrypt.hashpw(password_bytes, bcrypt.gensalt())

    # hashed_password comes back as bytes — decode it to store as text in Postgres
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

@router.get("/read_cookie")
def read_cookie(session_id: Annotated[str | None, Cookie()] = None):
    return {"session_id": session_id}