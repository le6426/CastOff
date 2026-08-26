from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.auth import router as auth_router
from app.routes.rooms import router as room_router
from app.routes.connect import router as connect_router
from app.routes.start_game import router as start_game_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", 
                   "http://localhost:5174", 
                   "http://localhost:4173", 
                   "https://omoggle-v2.vercel.app", 
                   "https://https://omoggle-v2-28d5nguda-le6426.vercel.app/"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(room_router)
app.include_router(connect_router)
app.include_router(start_game_router)

@app.get("/")
def read_root():
    return {"status": "online", "message": "FastAPI is up and running!"}