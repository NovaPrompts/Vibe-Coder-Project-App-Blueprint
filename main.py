import uvicorn
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Literal
import aiosqlite
import asyncio
from contextlib import asynccontextmanager

# --- Configuration ---
DB_NAME = "vibe_board.db"

# --- Models ---
class TaskBase(BaseModel):
    content: str
    category: Literal["todo", "in-progress", "done", "quick-list"] # 'quick-list' is the side todo list

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    content: Optional[str] = None
    category: Optional[Literal["todo", "in-progress", "done", "quick-list"]] = None

class Task(TaskBase):
    id: int
    created_at: str

class Note(BaseModel):
    id: int
    content: str

class NoteUpdate(BaseModel):
    content: str

# --- Database Setup ---
async def init_db():
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                category TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT DEFAULT ''
            )
        """)
        # Initialize single note entry if not exists
        cursor = await db.execute("SELECT count(*) FROM notes")
        count = await cursor.fetchone()
        if count[0] == 0:
            await db.execute("INSERT INTO notes (content) VALUES ('')")
        await db.commit()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(lifespan=lifespan, title="VibeBoard")

# --- Static Files ---
app.mount("/static", StaticFiles(directory="."), name="static")

# --- HTML Serve ---
@app.get("/", response_class=HTMLResponse)
async def read_root():
    with open("index.html", "r") as f:
        return f.read()

# --- API Endpoints: Tasks ---
@app.get("/api/tasks", response_model=List[Task])
async def get_tasks():
    try:
        async with aiosqlite.connect(DB_NAME) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM tasks ORDER BY created_at DESC")
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/api/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(task: TaskCreate):
    try:
        async with aiosqlite.connect(DB_NAME) as db:
            cursor = await db.execute(
                "INSERT INTO tasks (content, category) VALUES (?, ?)",
                (task.content, task.category)
            )
            await db.commit()
            task_id = cursor.lastrowid

            # Fetch back to get timestamp
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = await cursor.fetchone()
            return dict(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create task: {str(e)}")

@app.put("/api/tasks/{task_id}", response_model=Task)
async def update_task(task_id: int, task_update: TaskUpdate):
    try:
        async with aiosqlite.connect(DB_NAME) as db:
            # Build dynamic query
            fields = []
            values = []
            if task_update.content is not None:
                fields.append("content = ?")
                values.append(task_update.content)
            if task_update.category is not None:
                fields.append("category = ?")
                values.append(task_update.category)

            if not fields:
                raise HTTPException(status_code=400, detail="No fields to update")

            values.append(task_id)
            query = f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?"

            cursor = await db.execute(query, tuple(values))
            await db.commit()

            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Task not found")

            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            return dict(await cursor.fetchone())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")

@app.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int):
    try:
        async with aiosqlite.connect(DB_NAME) as db:
            cursor = await db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            await db.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- API Endpoints: Notes ---
@app.get("/api/note", response_model=Note)
async def get_note():
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        # We assume single note for simplicity (ID 1)
        cursor = await db.execute("SELECT * FROM notes LIMIT 1")
        return dict(await cursor.fetchone())

@app.put("/api/note", response_model=Note)
async def update_note(note: NoteUpdate):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("UPDATE notes SET content = ? WHERE id = (SELECT id FROM notes LIMIT 1)", (note.content,))
        await db.commit()
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM notes LIMIT 1")
        return dict(await cursor.fetchone())

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
