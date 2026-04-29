from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

settings = get_settings()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "Hello from Python on Vercel"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "api"}


@app.get("/api/items/{item_id}")
def read_item(item_id: int):
    return {"item_id": item_id}
