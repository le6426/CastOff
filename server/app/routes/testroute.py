from fastapi import APIRouter, HTTPException

router = APIRouter()


items = []


@router.post("/items")
def create_item(item):
    items.append(item)
    return items