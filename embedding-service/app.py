import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
MODEL = os.getenv('EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2')
@asynccontextmanager
async def lifespan(app):
    app.state.model = SentenceTransformer(MODEL)
    yield
app = FastAPI(lifespan=lifespan)
class Payload(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=50)
@app.get('/health')
def health():
    return {'ok': True, 'model': MODEL, 'dimensions': 384}
@app.post('/embed')
def embed(payload: Payload):
    if any(not t.strip() or len(t)>30000 for t in payload.texts):
        from fastapi import HTTPException
        raise HTTPException(400, 'Empty or oversized text')
    vectors = app.state.model.encode(payload.texts, normalize_embeddings=True).tolist()
    return {'model': MODEL, 'vectors': vectors}
