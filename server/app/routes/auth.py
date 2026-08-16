from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import bcrypt
from app.routes.users import get_user_by_username, create_user

router = APIRouter()

class RegisterRequest(BaseModel):
    username: str
    password: str

@router.post("/register")
def register_user(payload: RegisterRequest):
    if get_user_by_username(payload.username):
        raise HTTPException(status_code=400, detail="Username already taken")

    # bcrypt works with bytes, not strings — so we encode the password first
    password_bytes = payload.password.encode("utf-8")
    hashed_password = bcrypt.hashpw(password_bytes, bcrypt.gensalt())

    # hashed_password comes back as bytes — decode it to store as text in Postgres
    create_user(payload.username, hashed_password.decode("utf-8"))

    return {"message": "User registered successfully"}