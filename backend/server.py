from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, date
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    age: int
    current_role: str
    goal_role: str
    wake_time: str  # "06:00"
    sleep_time: str  # "22:00"
    work_start: str
    work_end: str
    assistant_mode: str  # "strict", "moderate", "casual"
    habits_to_build: List[str] = []
    habits_to_quit: List[str] = []
    goals: List[str] = []
    onboarding_completed: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserProfileCreate(BaseModel):
    name: str
    age: int
    current_role: str
    goal_role: str
    wake_time: str = "06:00"
    sleep_time: str = "22:00"
    work_start: str = "09:00"
    work_end: str = "18:00"
    assistant_mode: str = "moderate"
    habits_to_build: List[str] = []
    habits_to_quit: List[str] = []
    goals: List[str] = []

class HabitLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    habit_name: str
    habit_type: str  # "build" or "quit"
    completed: bool
    date: str  # "2025-07-15"
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class HabitLogCreate(BaseModel):
    user_id: str
    habit_name: str
    habit_type: str
    completed: bool
    date: str
    notes: Optional[str] = None

class DailyLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    mood: Optional[int] = None  # 1-5 scale
    energy_level: Optional[int] = None  # 1-5 scale
    productivity_score: Optional[int] = None  # 1-5 scale
    activities: List[str] = []
    notes: Optional[str] = None
    wake_time_actual: Optional[str] = None
    sleep_time_actual: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class DailyLogCreate(BaseModel):
    user_id: str
    date: str
    mood: Optional[int] = None
    energy_level: Optional[int] = None
    productivity_score: Optional[int] = None
    activities: List[str] = []
    notes: Optional[str] = None
    wake_time_actual: Optional[str] = None
    sleep_time_actual: Optional[str] = None

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    role: str  # "user" or "assistant"
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChatRequest(BaseModel):
    user_id: str
    message: str

class DailyAnalysis(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    summary: str
    achievements: List[str] = []
    improvements: List[str] = []
    recommendations: List[str] = []
    overall_score: int = 0  # 1-100
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str
    description: Optional[str] = None
    scheduled_time: Optional[str] = None
    date: str
    completed: bool = False
    priority: str = "medium"  # "low", "medium", "high"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TaskCreate(BaseModel):
    user_id: str
    title: str
    description: Optional[str] = None
    scheduled_time: Optional[str] = None
    date: str
    priority: str = "medium"

# ==================== USER ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "Life Transformation Assistant API"}

@api_router.post("/users", response_model=UserProfile)
async def create_user(user_data: UserProfileCreate):
    user_dict = user_data.model_dump()
    user = UserProfile(**user_dict, onboarding_completed=True)
    await db.users.insert_one(user.model_dump())
    return user

@api_router.get("/users/{user_id}", response_model=UserProfile)
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**user)

@api_router.put("/users/{user_id}", response_model=UserProfile)
async def update_user(user_id: str, user_data: UserProfileCreate):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_data.model_dump()
    update_data["updated_at"] = datetime.utcnow()
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    updated_user = await db.users.find_one({"id": user_id})
    return UserProfile(**updated_user)

# ==================== HABIT ENDPOINTS ====================

@api_router.post("/habits/log", response_model=HabitLog)
async def log_habit(habit_data: HabitLogCreate):
    # Check if already logged for this date
    existing = await db.habit_logs.find_one({
        "user_id": habit_data.user_id,
        "habit_name": habit_data.habit_name,
        "date": habit_data.date
    })
    
    if existing:
        # Update existing
        await db.habit_logs.update_one(
            {"id": existing["id"]},
            {"$set": {"completed": habit_data.completed, "notes": habit_data.notes}}
        )
        updated = await db.habit_logs.find_one({"id": existing["id"]})
        return HabitLog(**updated)
    
    habit_log = HabitLog(**habit_data.model_dump())
    await db.habit_logs.insert_one(habit_log.model_dump())
    return habit_log

# IMPORTANT: Static route must come before dynamic route
@api_router.get("/habits/{user_id}/streaks")
async def get_habit_streaks(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    all_habits = user.get("habits_to_build", []) + user.get("habits_to_quit", [])
    streaks = {}
    
    for habit in all_habits:
        logs = await db.habit_logs.find({
            "user_id": user_id,
            "habit_name": habit,
            "completed": True
        }).sort("date", -1).to_list(100)
        
        streak = 0
        if logs:
            from datetime import timedelta
            current_date = datetime.now().date()
            for log in logs:
                log_date = datetime.strptime(log["date"], "%Y-%m-%d").date()
                expected_date = current_date - timedelta(days=streak)
                if log_date == expected_date:
                    streak += 1
                else:
                    break
        
        streaks[habit] = streak
    
    return streaks

@api_router.get("/habits/{user_id}/{date}")
async def get_habits_for_date(user_id: str, date: str):
    logs = await db.habit_logs.find({"user_id": user_id, "date": date}).to_list(100)
    return [HabitLog(**log) for log in logs]

# ==================== DAILY LOG ENDPOINTS ====================

@api_router.post("/daily-log", response_model=DailyLog)
async def create_daily_log(log_data: DailyLogCreate):
    existing = await db.daily_logs.find_one({
        "user_id": log_data.user_id,
        "date": log_data.date
    })
    
    if existing:
        update_data = log_data.model_dump()
        update_data["updated_at"] = datetime.utcnow()
        await db.daily_logs.update_one({"id": existing["id"]}, {"$set": update_data})
        updated = await db.daily_logs.find_one({"id": existing["id"]})
        return DailyLog(**updated)
    
    daily_log = DailyLog(**log_data.model_dump())
    await db.daily_logs.insert_one(daily_log.model_dump())
    return daily_log

@api_router.get("/daily-log/{user_id}/{date}", response_model=Optional[DailyLog])
async def get_daily_log(user_id: str, date: str):
    log = await db.daily_logs.find_one({"user_id": user_id, "date": date})
    if log:
        return DailyLog(**log)
    return None

@api_router.get("/daily-logs/{user_id}")
async def get_daily_logs(user_id: str, limit: int = 7):
    logs = await db.daily_logs.find({"user_id": user_id}).sort("date", -1).to_list(limit)
    return [DailyLog(**log) for log in logs]

# ==================== TASK ENDPOINTS ====================

@api_router.post("/tasks", response_model=Task)
async def create_task(task_data: TaskCreate):
    task = Task(**task_data.model_dump())
    await db.tasks.insert_one(task.model_dump())
    return task

@api_router.get("/tasks/{user_id}/{date}")
async def get_tasks_for_date(user_id: str, date: str):
    tasks = await db.tasks.find({"user_id": user_id, "date": date}).to_list(100)
    return [Task(**task) for task in tasks]

@api_router.put("/tasks/{task_id}/complete")
async def complete_task(task_id: str, completed: bool = True):
    result = await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"completed": completed}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    task = await db.tasks.find_one({"id": task_id})
    return Task(**task)

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}

# ==================== AI CHAT ENDPOINTS ====================

@api_router.post("/chat")
async def chat_with_assistant(request: ChatRequest):
    try:
        # Get user profile for context
        user = await db.users.find_one({"id": request.user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_profile = UserProfile(**user)
        
        # Get recent chat history
        chat_history = await db.chat_messages.find(
            {"user_id": request.user_id}
        ).sort("created_at", -1).to_list(20)
        chat_history.reverse()
        
        # Get today's data
        today = datetime.now().strftime("%Y-%m-%d")
        today_habits = await db.habit_logs.find({"user_id": request.user_id, "date": today}).to_list(100)
        today_tasks = await db.tasks.find({"user_id": request.user_id, "date": today}).to_list(100)
        today_log = await db.daily_logs.find_one({"user_id": request.user_id, "date": today})
        
        # Build system message based on assistant mode
        mode_instructions = {
            "strict": "You are a strict, no-nonsense life coach. Be direct, firm, and push the user hard. Don't accept excuses. Hold them accountable.",
            "moderate": "You are a balanced life coach. Be supportive but also challenge the user. Provide encouragement while maintaining accountability.",
            "casual": "You are a friendly, supportive life coach. Be warm, understanding, and gentle. Focus on positive reinforcement and gradual improvement."
        }
        
        system_message = f"""
{mode_instructions.get(user_profile.assistant_mode, mode_instructions['moderate'])}

You are helping {user_profile.name}, age {user_profile.age}.
Current role: {user_profile.current_role}
Goal: Transition to {user_profile.goal_role}

Daily Schedule:
- Wake up: {user_profile.wake_time}
- Work: {user_profile.work_start} - {user_profile.work_end}
- Sleep: {user_profile.sleep_time}

Habits to Build: {', '.join(user_profile.habits_to_build) if user_profile.habits_to_build else 'None set'}
Habits to Quit: {', '.join(user_profile.habits_to_quit) if user_profile.habits_to_quit else 'None set'}
Goals: {', '.join(user_profile.goals) if user_profile.goals else 'None set'}

Today's Progress:
- Habits completed: {len([h for h in today_habits if h.get('completed')])} / {len(today_habits)}
- Tasks completed: {len([t for t in today_tasks if t.get('completed')])} / {len(today_tasks)}
- Mood: {today_log.get('mood', 'Not logged') if today_log else 'Not logged'}
- Energy: {today_log.get('energy_level', 'Not logged') if today_log else 'Not logged'}

Provide actionable advice, be specific, and reference their goals and schedule.
Keep responses concise (under 200 words) unless they ask for detailed information.
"""
        
        # Initialize chat
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"user_{request.user_id}",
            system_message=system_message
        ).with_model("openai", "gpt-5.2")
        
        # Add chat history context
        history_context = ""
        for msg in chat_history[-10:]:
            role = "User" if msg["role"] == "user" else "Assistant"
            history_context += f"{role}: {msg['content']}\n"
        
        full_message = f"Previous conversation:\n{history_context}\n\nUser's new message: {request.message}" if history_context else request.message
        
        user_message = UserMessage(text=full_message)
        response = await chat.send_message(user_message)
        
        # Save messages to database
        user_msg = ChatMessage(
            user_id=request.user_id,
            role="user",
            content=request.message
        )
        assistant_msg = ChatMessage(
            user_id=request.user_id,
            role="assistant",
            content=response
        )
        
        await db.chat_messages.insert_one(user_msg.model_dump())
        await db.chat_messages.insert_one(assistant_msg.model_dump())
        
        return {"response": response, "message_id": assistant_msg.id}
        
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/chat/{user_id}/history")
async def get_chat_history(user_id: str, limit: int = 50):
    messages = await db.chat_messages.find(
        {"user_id": user_id}
    ).sort("created_at", -1).to_list(limit)
    messages.reverse()
    return [ChatMessage(**msg) for msg in messages]

# ==================== DAILY ANALYSIS ENDPOINT ====================

@api_router.post("/analysis/{user_id}")
async def generate_daily_analysis(user_id: str, date: str = None):
    try:
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
        
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_profile = UserProfile(**user)
        
        # Get today's data
        habits = await db.habit_logs.find({"user_id": user_id, "date": date}).to_list(100)
        tasks = await db.tasks.find({"user_id": user_id, "date": date}).to_list(100)
        daily_log = await db.daily_logs.find_one({"user_id": user_id, "date": date})
        
        # Build analysis prompt
        habits_summary = "\n".join([f"- {h['habit_name']}: {'Completed' if h['completed'] else 'Missed'}" for h in habits])
        tasks_summary = "\n".join([f"- {t['title']}: {'Completed' if t['completed'] else 'Pending'}" for t in tasks])
        
        prompt = f"""
Analyze this person's day and provide a comprehensive daily review.

Person: {user_profile.name}, {user_profile.age} years old
Goal: Transition from {user_profile.current_role} to {user_profile.goal_role}
Assistant Mode: {user_profile.assistant_mode}

Habits to Build: {', '.join(user_profile.habits_to_build)}
Habits to Quit: {', '.join(user_profile.habits_to_quit)}

Today's Habits:
{habits_summary if habits_summary else 'No habits logged'}

Today's Tasks:
{tasks_summary if tasks_summary else 'No tasks logged'}

Daily Log:
- Mood: {daily_log.get('mood', 'Not logged') if daily_log else 'Not logged'}/5
- Energy: {daily_log.get('energy_level', 'Not logged') if daily_log else 'Not logged'}/5
- Productivity: {daily_log.get('productivity_score', 'Not logged') if daily_log else 'Not logged'}/5
- Notes: {daily_log.get('notes', 'None') if daily_log else 'None'}

Provide your analysis in this exact JSON format:
{{
    "summary": "2-3 sentence overview of the day",
    "achievements": ["achievement 1", "achievement 2"],
    "improvements": ["area to improve 1", "area to improve 2"],
    "recommendations": ["specific actionable recommendation 1", "specific actionable recommendation 2"],
    "overall_score": 75
}}

Be {'strict and direct' if user_profile.assistant_mode == 'strict' else 'balanced' if user_profile.assistant_mode == 'moderate' else 'encouraging and supportive'} in your tone.
"""
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"analysis_{user_id}_{date}",
            system_message="You are a life coach analyzing daily performance. Always respond with valid JSON only."
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Parse the JSON response
        import json
        try:
            # Clean the response (remove markdown code blocks if present)
            clean_response = response.strip()
            if clean_response.startswith("```"):
                clean_response = clean_response.split("```")[1]
                if clean_response.startswith("json"):
                    clean_response = clean_response[4:]
            clean_response = clean_response.strip()
            
            analysis_data = json.loads(clean_response)
        except json.JSONDecodeError:
            analysis_data = {
                "summary": response[:200],
                "achievements": [],
                "improvements": [],
                "recommendations": [],
                "overall_score": 50
            }
        
        analysis = DailyAnalysis(
            user_id=user_id,
            date=date,
            summary=analysis_data.get("summary", ""),
            achievements=analysis_data.get("achievements", []),
            improvements=analysis_data.get("improvements", []),
            recommendations=analysis_data.get("recommendations", []),
            overall_score=analysis_data.get("overall_score", 50)
        )
        
        # Save or update analysis
        existing = await db.daily_analysis.find_one({"user_id": user_id, "date": date})
        if existing:
            await db.daily_analysis.update_one(
                {"id": existing["id"]},
                {"$set": analysis.model_dump()}
            )
        else:
            await db.daily_analysis.insert_one(analysis.model_dump())
        
        return analysis
        
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/analysis/{user_id}/{date}")
async def get_daily_analysis(user_id: str, date: str):
    analysis = await db.daily_analysis.find_one({"user_id": user_id, "date": date})
    if analysis:
        return DailyAnalysis(**analysis)
    return None

# ==================== STATS ENDPOINTS ====================

@api_router.get("/stats/{user_id}")
async def get_user_stats(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get last 7 days of data
    from datetime import timedelta
    today = datetime.now().date()
    dates = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    
    habit_completion = []
    task_completion = []
    mood_data = []
    
    for d in dates:
        habits = await db.habit_logs.find({"user_id": user_id, "date": d}).to_list(100)
        tasks = await db.tasks.find({"user_id": user_id, "date": d}).to_list(100)
        daily_log = await db.daily_logs.find_one({"user_id": user_id, "date": d})
        
        completed_habits = len([h for h in habits if h.get("completed")])
        total_habits = len(habits) if habits else 1
        habit_completion.append({"date": d, "percentage": int((completed_habits / total_habits) * 100) if total_habits > 0 else 0})
        
        completed_tasks = len([t for t in tasks if t.get("completed")])
        total_tasks = len(tasks) if tasks else 1
        task_completion.append({"date": d, "percentage": int((completed_tasks / total_tasks) * 100) if total_tasks > 0 else 0})
        
        mood_data.append({"date": d, "mood": daily_log.get("mood", 0) if daily_log else 0})
    
    return {
        "habit_completion": habit_completion,
        "task_completion": task_completion,
        "mood_data": mood_data
    }

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
