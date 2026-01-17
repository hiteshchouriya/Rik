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
from datetime import datetime, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    age: int
    current_role: str
    goal_role: str
    wake_time: str = "06:00"
    sleep_time: str = "22:00"
    work_start: str = "09:00"
    work_end: str = "18:00"
    assistant_mode: str = "strict"
    habits_to_build: List[str] = []
    habits_to_quit: List[str] = []
    goals: List[str] = []
    daily_challenges: List[str] = []  # What user struggles with
    preferred_gym_time: str = ""
    commute_method: str = ""  # bus, car, walk, etc.
    location_home: Optional[Dict] = None
    location_work: Optional[Dict] = None
    location_gym: Optional[Dict] = None
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
    assistant_mode: str = "strict"
    habits_to_build: List[str] = []
    habits_to_quit: List[str] = []
    goals: List[str] = []
    daily_challenges: List[str] = []
    preferred_gym_time: str = ""
    commute_method: str = ""

class ScheduleItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    time: str
    title: str
    description: str
    duration_minutes: int
    category: str  # wake, exercise, work, meal, learning, break, sleep
    completed: bool = False
    ai_generated: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class HabitLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    habit_name: str
    habit_type: str
    completed: bool
    date: str
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class HabitLogCreate(BaseModel):
    user_id: str
    habit_name: str
    habit_type: str
    completed: bool
    date: str
    notes: Optional[str] = None

class LocationLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    latitude: float
    longitude: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    location_type: Optional[str] = None  # home, work, gym, other

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    role: str
    content: str
    is_voice: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class VoiceCommand(BaseModel):
    user_id: str
    command: str
    context: Optional[str] = None

class DailyPlanRequest(BaseModel):
    user_id: str
    date: str
    user_input: Optional[str] = None  # What user wants to do today

class DailyAnalysis(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    summary: str
    achievements: List[str] = []
    improvements: List[str] = []
    recommendations: List[str] = []
    overall_score: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ==================== USER ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "Rik - Your AI Life Coach API"}

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

@api_router.put("/users/{user_id}/location")
async def update_user_location(user_id: str, location_type: str, latitude: float, longitude: float):
    location_field = f"location_{location_type}"
    await db.users.update_one(
        {"id": user_id},
        {"$set": {location_field: {"lat": latitude, "lng": longitude}}}
    )
    return {"status": "updated"}

# ==================== SMART SCHEDULE GENERATION ====================

@api_router.post("/schedule/generate")
async def generate_daily_schedule(request: DailyPlanRequest):
    """AI generates your entire day schedule based on your profile and what you want to achieve"""
    try:
        user = await db.users.find_one({"id": request.user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_profile = UserProfile(**user)
        
        # Get existing habits and goals
        habits_build = ", ".join(user_profile.habits_to_build) if user_profile.habits_to_build else "None set"
        habits_quit = ", ".join(user_profile.habits_to_quit) if user_profile.habits_to_quit else "None set"
        goals = ", ".join(user_profile.goals) if user_profile.goals else "None set"
        challenges = ", ".join(user_profile.daily_challenges) if user_profile.daily_challenges else "None mentioned"
        
        prompt = f"""
You are Rik, a strict AI life coach. Generate a detailed daily schedule for {user_profile.name}.

USER PROFILE:
- Age: {user_profile.age}
- Current: {user_profile.current_role} → Goal: {user_profile.goal_role}
- Wake time: {user_profile.wake_time}, Sleep time: {user_profile.sleep_time}
- Work hours: {user_profile.work_start} - {user_profile.work_end}
- Gym time preference: {user_profile.preferred_gym_time or 'flexible'}
- Commute method: {user_profile.commute_method or 'not specified'}

HABITS TO BUILD: {habits_build}
HABITS TO QUIT: {habits_quit}
GOALS: {goals}
DAILY CHALLENGES/STRUGGLES: {challenges}

USER'S INPUT FOR TODAY: {request.user_input or 'No specific requests - create optimal day'}

Generate a strict, time-blocked schedule from wake to sleep. Include:
1. Morning routine (wake up, exercise, breakfast)
2. Work blocks with breaks
3. Skill development time for their goal transition
4. Meals and hydration reminders
5. Evening wind-down and reflection

Be STRICT - no wasted time. Account for their struggles.

Return ONLY a JSON array with this exact format (no markdown, no explanation):
[
  {{"time": "06:00", "title": "Wake Up", "description": "Get out of bed immediately. No snoozing.", "duration_minutes": 5, "category": "wake"}},
  {{"time": "06:05", "title": "Hydration", "description": "Drink 500ml water before anything else.", "duration_minutes": 5, "category": "health"}}
]

Categories: wake, exercise, work, meal, learning, break, health, sleep
"""
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"schedule_{request.user_id}_{request.date}",
            system_message="You are Rik, a strict AI life coach. Return only valid JSON arrays."
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Parse JSON response
        import json
        clean_response = response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        clean_response = clean_response.strip()
        
        try:
            schedule_items = json.loads(clean_response)
        except:
            # Fallback schedule
            schedule_items = [
                {"time": user_profile.wake_time, "title": "Wake Up", "description": "Start your day strong!", "duration_minutes": 5, "category": "wake"},
                {"time": "07:00", "title": "Exercise", "description": "30 min workout", "duration_minutes": 30, "category": "exercise"},
            ]
        
        # Save to database
        await db.schedules.delete_many({"user_id": request.user_id, "date": request.date})
        
        saved_items = []
        for item in schedule_items:
            schedule_item = ScheduleItem(
                user_id=request.user_id,
                date=request.date,
                time=item.get("time", "00:00"),
                title=item.get("title", "Task"),
                description=item.get("description", ""),
                duration_minutes=item.get("duration_minutes", 30),
                category=item.get("category", "other"),
                ai_generated=True
            )
            await db.schedules.insert_one(schedule_item.model_dump())
            saved_items.append(schedule_item.model_dump())
        
        return {"schedule": saved_items, "message": f"Your day is planned, {user_profile.name}. Let's crush it!"}
        
    except Exception as e:
        logger.error(f"Schedule generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/schedule/{user_id}/{date}")
async def get_schedule(user_id: str, date: str):
    items = await db.schedules.find({"user_id": user_id, "date": date}).sort("time", 1).to_list(100)
    return [ScheduleItem(**item) for item in items]

@api_router.put("/schedule/{item_id}/complete")
async def complete_schedule_item(item_id: str):
    await db.schedules.update_one({"id": item_id}, {"$set": {"completed": True}})
    return {"status": "completed"}

# ==================== RIK VOICE ASSISTANT ====================

@api_router.post("/rik/command")
async def process_rik_command(command: VoiceCommand):
    """Process voice commands to Rik"""
    try:
        user = await db.users.find_one({"id": command.user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_profile = UserProfile(**user)
        today = datetime.now().strftime("%Y-%m-%d")
        current_time = datetime.now().strftime("%H:%M")
        
        # Get today's schedule
        schedule = await db.schedules.find({"user_id": command.user_id, "date": today}).sort("time", 1).to_list(100)
        schedule_summary = "\n".join([f"- {s['time']}: {s['title']} ({s['description']})" for s in schedule[:5]]) if schedule else "No schedule set for today"
        
        # Get habits status
        habits = await db.habit_logs.find({"user_id": command.user_id, "date": today}).to_list(100)
        habits_done = [h['habit_name'] for h in habits if h.get('completed')]
        habits_pending = [h for h in user_profile.habits_to_build if h not in habits_done]
        
        system_prompt = f"""
You are Rik, a strict but caring AI life coach assistant. You speak directly and firmly.
You're helping {user_profile.name} transform from {user_profile.current_role} to {user_profile.goal_role}.

Current time: {current_time}
Today's date: {today}

Today's Schedule:
{schedule_summary}

Habits completed today: {', '.join(habits_done) if habits_done else 'None yet'}
Habits pending: {', '.join(habits_pending) if habits_pending else 'All done!'}

User's challenges: {', '.join(user_profile.daily_challenges) if user_profile.daily_challenges else 'None mentioned'}
Mode: {user_profile.assistant_mode}

RESPONSE RULES:
1. Keep responses SHORT (under 50 words for voice)
2. Be direct and actionable
3. If they ask what to do, tell them the NEXT task
4. If they're procrastinating, call them out
5. Use their name occasionally
6. End with a clear instruction or question

Respond as if speaking out loud.
"""
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        chat = LlmChat(
            api_key=api_key,
            session_id=f"rik_{command.user_id}",
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=command.command)
        response = await chat.send_message(user_message)
        
        # Save to chat history
        user_msg = ChatMessage(user_id=command.user_id, role="user", content=command.command, is_voice=True)
        rik_msg = ChatMessage(user_id=command.user_id, role="assistant", content=response, is_voice=True)
        await db.chat_messages.insert_one(user_msg.model_dump())
        await db.chat_messages.insert_one(rik_msg.model_dump())
        
        return {"response": response, "message_id": rik_msg.id}
        
    except Exception as e:
        logger.error(f"Rik command error: {str(e)}")
        return {"response": "Sorry, I couldn't process that. Say it again?", "error": str(e)}

@api_router.get("/rik/next-task/{user_id}")
async def get_next_task(user_id: str):
    """Get the next upcoming task for proactive reminders"""
    today = datetime.now().strftime("%Y-%m-%d")
    current_time = datetime.now().strftime("%H:%M")
    
    schedule = await db.schedules.find({
        "user_id": user_id,
        "date": today,
        "completed": False,
        "time": {"$gte": current_time}
    }).sort("time", 1).to_list(1)
    
    if schedule:
        next_item = schedule[0]
        return {
            "has_task": True,
            "task": next_item,
            "message": f"Coming up at {next_item['time']}: {next_item['title']}"
        }
    return {"has_task": False, "message": "No more scheduled tasks for today"}

@api_router.get("/rik/status/{user_id}")
async def get_rik_status(user_id: str):
    """Get current status for Rik to announce"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_profile = UserProfile(**user)
    today = datetime.now().strftime("%Y-%m-%d")
    current_time = datetime.now().strftime("%H:%M")
    current_hour = datetime.now().hour
    
    # Get schedule stats
    schedule = await db.schedules.find({"user_id": user_id, "date": today}).to_list(100)
    completed = len([s for s in schedule if s.get('completed')])
    total = len(schedule)
    
    # Get habits
    habit_logs = await db.habit_logs.find({"user_id": user_id, "date": today}).to_list(100)
    habits_done = len([h for h in habit_logs if h.get('completed')])
    habits_total = len(user_profile.habits_to_build) + len(user_profile.habits_to_quit)
    
    # Determine greeting
    if current_hour < 12:
        greeting = "Good morning"
    elif current_hour < 17:
        greeting = "Good afternoon"
    else:
        greeting = "Good evening"
    
    return {
        "greeting": greeting,
        "name": user_profile.name,
        "schedule_completed": completed,
        "schedule_total": total,
        "habits_done": habits_done,
        "habits_total": habits_total,
        "current_time": current_time
    }

# ==================== LOCATION TRACKING ====================

@api_router.post("/location/log")
async def log_location(user_id: str, latitude: float, longitude: float):
    """Log user location for context-aware assistance"""
    log = LocationLog(user_id=user_id, latitude=latitude, longitude=longitude)
    await db.location_logs.insert_one(log.model_dump())
    
    # Determine location type
    user = await db.users.find_one({"id": user_id})
    location_type = "other"
    if user:
        # Simple distance check (would use proper geo distance in production)
        if user.get("location_home"):
            home = user["location_home"]
            if abs(home.get("lat", 0) - latitude) < 0.001 and abs(home.get("lng", 0) - longitude) < 0.001:
                location_type = "home"
        if user.get("location_work"):
            work = user["location_work"]
            if abs(work.get("lat", 0) - latitude) < 0.001 and abs(work.get("lng", 0) - longitude) < 0.001:
                location_type = "work"
        if user.get("location_gym"):
            gym = user["location_gym"]
            if abs(gym.get("lat", 0) - latitude) < 0.001 and abs(gym.get("lng", 0) - longitude) < 0.001:
                location_type = "gym"
    
    return {"logged": True, "location_type": location_type}

# ==================== HABIT TRACKING ====================

@api_router.post("/habits/log", response_model=HabitLog)
async def log_habit(habit_data: HabitLogCreate):
    existing = await db.habit_logs.find_one({
        "user_id": habit_data.user_id,
        "habit_name": habit_data.habit_name,
        "date": habit_data.date
    })
    
    if existing:
        await db.habit_logs.update_one(
            {"id": existing["id"]},
            {"$set": {"completed": habit_data.completed, "notes": habit_data.notes}}
        )
        updated = await db.habit_logs.find_one({"id": existing["id"]})
        return HabitLog(**updated)
    
    habit_log = HabitLog(**habit_data.model_dump())
    await db.habit_logs.insert_one(habit_log.model_dump())
    return habit_log

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

# ==================== DAILY ANALYSIS ====================

@api_router.post("/analysis/{user_id}")
async def generate_daily_analysis(user_id: str, date: str = None):
    try:
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
        
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_profile = UserProfile(**user)
        
        habits = await db.habit_logs.find({"user_id": user_id, "date": date}).to_list(100)
        schedule = await db.schedules.find({"user_id": user_id, "date": date}).to_list(100)
        
        habits_summary = "\n".join([f"- {h['habit_name']}: {'Done' if h['completed'] else 'Missed'}" for h in habits])
        schedule_summary = "\n".join([f"- {s['time']} {s['title']}: {'Done' if s['completed'] else 'Missed'}" for s in schedule])
        
        prompt = f"""
As Rik, analyze {user_profile.name}'s day and give a STRICT performance review.

Goal: {user_profile.current_role} → {user_profile.goal_role}
Challenges: {', '.join(user_profile.daily_challenges)}

Habits:
{habits_summary if habits_summary else 'Nothing logged'}

Schedule:
{schedule_summary if schedule_summary else 'Nothing scheduled'}

Return JSON only:
{{
    "summary": "2 sentence overview - be direct",
    "achievements": ["what they did well"],
    "improvements": ["what they need to fix"],
    "recommendations": ["specific action for tomorrow"],
    "overall_score": 75
}}
"""
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        chat = LlmChat(
            api_key=api_key,
            session_id=f"analysis_{user_id}_{date}",
            system_message="You are Rik, a strict life coach. Return only valid JSON."
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        import json
        clean_response = response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        
        try:
            analysis_data = json.loads(clean_response.strip())
        except:
            analysis_data = {"summary": response[:200], "achievements": [], "improvements": [], "recommendations": [], "overall_score": 50}
        
        analysis = DailyAnalysis(
            user_id=user_id,
            date=date,
            summary=analysis_data.get("summary", ""),
            achievements=analysis_data.get("achievements", []),
            improvements=analysis_data.get("improvements", []),
            recommendations=analysis_data.get("recommendations", []),
            overall_score=analysis_data.get("overall_score", 50)
        )
        
        existing = await db.daily_analysis.find_one({"user_id": user_id, "date": date})
        if existing:
            await db.daily_analysis.update_one({"id": existing["id"]}, {"$set": analysis.model_dump()})
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

@api_router.get("/chat/{user_id}/history")
async def get_chat_history(user_id: str, limit: int = 50):
    messages = await db.chat_messages.find({"user_id": user_id}).sort("created_at", -1).to_list(limit)
    messages.reverse()
    return [ChatMessage(**msg) for msg in messages]

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
