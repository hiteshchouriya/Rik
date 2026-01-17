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
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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
    daily_challenges: List[str] = []
    actual_routine: str = ""  # User's real routine description
    preferred_gym_time: str = ""
    commute_method: str = ""
    location_home: Optional[Dict] = None
    location_work: Optional[Dict] = None
    location_gym: Optional[Dict] = None
    points: int = 0  # Gamification points
    streak_days: int = 0
    last_active_date: str = ""
    onboarding_completed: bool = False
    routine_learned: bool = False  # Has Rik learned their routine?
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
    actual_routine: str = ""
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
    category: str
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

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    role: str
    content: str
    message_type: str = "chat"  # chat, routine_learning, schedule_planning, checkin
    created_at: datetime = Field(default_factory=datetime.utcnow)

class RikConversation(BaseModel):
    user_id: str
    message: str
    context: str = "general"  # general, learning_routine, planning_day, checkin, motivation

class DailyPlanRequest(BaseModel):
    user_id: str
    date: str
    user_preferences: Optional[str] = None

class CheckInResponse(BaseModel):
    user_id: str
    task_id: str
    response: str  # yes, no, partial, skip

class DailyAnalysis(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    summary: str
    achievements: List[str] = []
    improvements: List[str] = []
    recommendations: List[str] = []
    overall_score: int = 0
    points_earned: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class InsightData(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    insight_type: str  # pattern, achievement, warning, tip
    title: str
    description: str
    data: Dict = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ==================== USER ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "Rik - Your AI Life Coach API v2"}

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

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, updates: Dict):
    updates["updated_at"] = datetime.utcnow()
    await db.users.update_one({"id": user_id}, {"$set": updates})
    return {"status": "updated"}

@api_router.put("/users/{user_id}/routine")
async def save_user_routine(user_id: str, routine: str):
    """Save user's actual daily routine after Rik learns it"""
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"actual_routine": routine, "routine_learned": True, "updated_at": datetime.utcnow()}}
    )
    return {"status": "routine_saved"}

@api_router.post("/users/{user_id}/add-points")
async def add_points(user_id: str, points: int):
    """Add gamification points"""
    await db.users.update_one({"id": user_id}, {"$inc": {"points": points}})
    user = await db.users.find_one({"id": user_id})
    return {"total_points": user.get("points", 0)}

# ==================== RIK INTELLIGENT CONVERSATION ====================

@api_router.post("/rik/chat")
async def rik_intelligent_chat(request: RikConversation):
    """Main Rik conversation endpoint - context-aware responses"""
    try:
        user = await db.users.find_one({"id": request.user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_profile = UserProfile(**user)
        today = datetime.now().strftime("%Y-%m-%d")
        current_time = datetime.now().strftime("%H:%M")
        current_hour = datetime.now().hour
        
        # Get context data
        schedule = await db.schedules.find({"user_id": request.user_id, "date": today}).sort("time", 1).to_list(100)
        habits = await db.habit_logs.find({"user_id": request.user_id, "date": today}).to_list(100)
        recent_chats = await db.chat_messages.find({"user_id": request.user_id}).sort("created_at", -1).to_list(10)
        recent_chats.reverse()
        
        # Build conversation history
        chat_history = "\n".join([f"{'User' if c['role']=='user' else 'Rik'}: {c['content']}" for c in recent_chats[-6:]])
        
        # Build context-specific system prompt
        if request.context == "learning_routine":
            system_prompt = f"""
You are Rik, learning about {user_profile.name}'s actual daily routine.

Your goal: Understand their REAL day - what they actually do, not what they wish they did.

Ask about:
1. What time do they ACTUALLY wake up (not ideally)?
2. What's the first thing they do? (Phone? Coffee? Exercise?)
3. When do they start work? How does work day look?
4. When do they eat meals? What do they eat?
5. What time do they ACTUALLY sleep?
6. What activities eat up their time? (Social media, YouTube, etc.)
7. When do they feel most productive vs most distracted?

Be conversational, ask ONE question at a time. Don't lecture.
After gathering enough info (4-5 exchanges), summarize their routine.

Previous conversation:
{chat_history}

User's latest message: {request.message}
"""
        elif request.context == "planning_day":
            system_prompt = f"""
You are Rik, helping {user_profile.name} plan their day.

Their profile:
- Current: {user_profile.current_role} → Goal: {user_profile.goal_role}
- Usual wake: {user_profile.wake_time}, sleep: {user_profile.sleep_time}
- Work: {user_profile.work_start} - {user_profile.work_end}
- Habits building: {', '.join(user_profile.habits_to_build)}
- Struggles: {', '.join(user_profile.daily_challenges)}
- Their actual routine: {user_profile.actual_routine or 'Not yet learned'}

Ask them:
1. Any fixed appointments/meetings today?
2. What's the ONE thing they MUST accomplish today?
3. How are they feeling - energy level?
4. Any challenges they're anticipating?

After 2-3 exchanges, you'll have enough to generate their schedule.
When ready, say: "Got it. Let me create your schedule. Say 'generate schedule' when ready."

Previous conversation:
{chat_history}
"""
        elif request.context == "checkin":
            # Find current/upcoming task
            upcoming = [s for s in schedule if s['time'] >= current_time and not s['completed']]
            current_task = upcoming[0] if upcoming else None
            
            system_prompt = f"""
You are Rik doing a check-in with {user_profile.name}.

Current time: {current_time}
Current/Next task: {current_task['title'] if current_task else 'None scheduled'}

Schedule completion: {len([s for s in schedule if s['completed']])}/{len(schedule)}
Habits done: {len([h for h in habits if h['completed']])}

Your job:
1. Check if they're on track
2. If behind, understand why (no judgment initially)
3. Help them get back on track with specific next action
4. Be direct but supportive

Keep responses SHORT (under 40 words).
"""
        else:  # general
            system_prompt = f"""
You are Rik, a strict but caring AI life coach for {user_profile.name}.

Profile:
- {user_profile.age} years old, {user_profile.current_role} → {user_profile.goal_role}
- Challenges: {', '.join(user_profile.daily_challenges) or 'None specified'}
- Mode: {user_profile.assistant_mode}
- Points earned: {user_profile.points}
- Streak: {user_profile.streak_days} days

Current time: {current_time}
Today's schedule: {len(schedule)} tasks, {len([s for s in schedule if s['completed']])} done
Routine learned: {'Yes' if user_profile.routine_learned else 'No - you should learn it first!'}

Rules:
1. Keep responses SHORT (under 50 words) - you're voice-friendly
2. Be direct, no fluff
3. Give ONE clear action or question
4. If they haven't told you their routine yet, ask to learn it first
5. Use their name occasionally
6. If it's morning, give morning briefing
7. If it's evening, prompt for daily review

Previous conversation:
{chat_history}
"""
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        chat = LlmChat(
            api_key=api_key,
            session_id=f"rik_{request.user_id}_{request.context}",
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=request.message)
        response = await chat.send_message(user_message)
        
        # Determine response type for frontend
        response_type = "chat"
        action_required = None
        
        if "generate schedule" in response.lower() or "create your schedule" in response.lower():
            response_type = "ready_to_generate"
            action_required = "generate_schedule"
        elif "learn" in response.lower() and "routine" in response.lower() and not user_profile.routine_learned:
            response_type = "suggest_learning"
            action_required = "learn_routine"
        
        # Save messages
        user_msg = ChatMessage(user_id=request.user_id, role="user", content=request.message, message_type=request.context)
        rik_msg = ChatMessage(user_id=request.user_id, role="assistant", content=response, message_type=request.context)
        await db.chat_messages.insert_one(user_msg.model_dump())
        await db.chat_messages.insert_one(rik_msg.model_dump())
        
        return {
            "response": response,
            "response_type": response_type,
            "action_required": action_required,
            "context": request.context,
            "routine_learned": user_profile.routine_learned
        }
        
    except Exception as e:
        logger.error(f"Rik chat error: {str(e)}")
        return {"response": "Sorry, I couldn't process that. Try again?", "error": str(e)}

@api_router.post("/rik/learn-routine")
async def learn_routine_from_conversation(user_id: str):
    """Extract and save routine from conversation history"""
    try:
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get learning conversation
        chats = await db.chat_messages.find({
            "user_id": user_id,
            "message_type": "learning_routine"
        }).sort("created_at", -1).to_list(20)
        
        conversation = "\n".join([f"{'User' if c['role']=='user' else 'Rik'}: {c['content']}" for c in reversed(chats)])
        
        prompt = f"""
From this conversation, extract the user's actual daily routine.

Conversation:
{conversation}

Return a structured summary in this format:
"Wake: [time] - [what they do]
Morning: [activities]
Work: [hours and type]
Breaks: [what they do]
Evening: [activities]
Sleep: [time]
Distractions: [what wastes their time]
Best productive time: [when]"

Be factual, use what they actually said.
"""
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        chat = LlmChat(
            api_key=api_key,
            session_id=f"routine_extract_{user_id}",
            system_message="Extract routine information accurately."
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        # Save routine
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"actual_routine": response, "routine_learned": True}}
        )
        
        return {"routine": response, "saved": True}
        
    except Exception as e:
        logger.error(f"Learn routine error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/rik/generate-smart-schedule")
async def generate_smart_schedule(request: DailyPlanRequest):
    """Generate schedule based on learned routine + today's preferences"""
    try:
        user = await db.users.find_one({"id": request.user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_profile = UserProfile(**user)
        
        # Get recent planning conversation for today's preferences
        recent_planning = await db.chat_messages.find({
            "user_id": request.user_id,
            "message_type": "planning_day"
        }).sort("created_at", -1).to_list(10)
        
        planning_context = "\n".join([f"{'User' if c['role']=='user' else 'Rik'}: {c['content']}" for c in reversed(recent_planning)])
        
        prompt = f"""
Create a realistic daily schedule for {user_profile.name}.

PROFILE:
- Goal: {user_profile.current_role} → {user_profile.goal_role}
- Wake: {user_profile.wake_time}, Sleep: {user_profile.sleep_time}
- Work: {user_profile.work_start} - {user_profile.work_end}
- Gym preference: {user_profile.preferred_gym_time or 'flexible'}

THEIR ACTUAL ROUTINE (what they really do):
{user_profile.actual_routine or 'Not learned yet - use defaults'}

HABITS TO BUILD: {', '.join(user_profile.habits_to_build)}
CHALLENGES: {', '.join(user_profile.daily_challenges)}

TODAY'S PLANNING CONVERSATION:
{planning_context or 'No specific requests'}

USER'S ADDITIONAL INPUT: {request.user_preferences or 'None'}

RULES:
1. Be REALISTIC - account for their actual habits, not ideal ones
2. Build in buffer time for their known distractions
3. Put important tasks during their productive hours
4. Include specific times for habit-building activities
5. Add breaks (they need them)
6. Include meal times
7. End with evening wind-down

Return ONLY a JSON array:
[
  {{"time": "06:00", "title": "Wake Up", "description": "Specific instruction", "duration_minutes": 5, "category": "wake"}},
  ...
]

Categories: wake, exercise, work, meal, learning, break, health, sleep, focus
"""
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        chat = LlmChat(
            api_key=api_key,
            session_id=f"schedule_{request.user_id}_{request.date}",
            system_message="Generate realistic schedules. Return only valid JSON arrays."
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        # Parse JSON
        clean_response = response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        
        try:
            schedule_items = json.loads(clean_response.strip())
        except:
            schedule_items = [
                {"time": user_profile.wake_time, "title": "Wake Up", "description": "Start your day", "duration_minutes": 5, "category": "wake"}
            ]
        
        # Clear old schedule and save new
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
        
        return {
            "schedule": saved_items,
            "count": len(saved_items),
            "message": f"Schedule ready with {len(saved_items)} tasks. Let's execute!"
        }
        
    except Exception as e:
        logger.error(f"Schedule generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/rik/morning-briefing/{user_id}")
async def get_morning_briefing(user_id: str):
    """Generate morning briefing for the user"""
    try:
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_profile = UserProfile(**user)
        today = datetime.now().strftime("%Y-%m-%d")
        
        schedule = await db.schedules.find({"user_id": user_id, "date": today}).sort("time", 1).to_list(100)
        
        # Get yesterday's performance
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        yesterday_analysis = await db.daily_analysis.find_one({"user_id": user_id, "date": yesterday})
        
        prompt = f"""
Create a brief, energizing morning briefing for {user_profile.name}.

Today: {datetime.now().strftime('%A, %B %d')}
Their goal: {user_profile.goal_role}
Schedule today: {len(schedule)} tasks planned
Yesterday's score: {yesterday_analysis.get('overall_score', 'N/A') if yesterday_analysis else 'No data'}
Streak: {user_profile.streak_days} days
Points: {user_profile.points}

First 3 tasks today:
{chr(10).join([f"- {s['time']}: {s['title']}" for s in schedule[:3]]) if schedule else 'No schedule yet'}

Create a 30-second briefing that:
1. Greets them with energy
2. States ONE key focus for today
3. Mentions first task
4. Ends with motivation

Keep it under 60 words. Be direct.
"""
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        chat = LlmChat(
            api_key=api_key,
            session_id=f"briefing_{user_id}_{today}",
            system_message="Create energizing morning briefings. Be concise."
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        return {
            "briefing": response,
            "schedule_count": len(schedule),
            "first_task": schedule[0] if schedule else None,
            "streak": user_profile.streak_days,
            "points": user_profile.points
        }
        
    except Exception as e:
        logger.error(f"Briefing error: {str(e)}")
        return {"briefing": f"Good morning {user_profile.name}! Ready to crush today?", "error": str(e)}

@api_router.get("/rik/insights/{user_id}")
async def get_user_insights(user_id: str):
    """Get AI-generated insights about user's patterns"""
    try:
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get last 7 days of data
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        habit_logs = await db.habit_logs.find({
            "user_id": user_id,
            "date": {"$gte": week_ago}
        }).to_list(500)
        
        schedule_logs = await db.schedules.find({
            "user_id": user_id,
            "date": {"$gte": week_ago}
        }).to_list(500)
        
        analyses = await db.daily_analysis.find({
            "user_id": user_id,
            "date": {"$gte": week_ago}
        }).to_list(7)
        
        # Calculate patterns
        habits_completed = len([h for h in habit_logs if h.get('completed')])
        habits_total = len(habit_logs)
        tasks_completed = len([s for s in schedule_logs if s.get('completed')])
        tasks_total = len(schedule_logs)
        avg_score = sum([a.get('overall_score', 0) for a in analyses]) / len(analyses) if analyses else 0
        
        insights = []
        
        # Habit insight
        if habits_total > 0:
            habit_rate = (habits_completed / habits_total) * 100
            insights.append({
                "type": "pattern",
                "title": "Habit Completion Rate",
                "description": f"You've completed {habit_rate:.0f}% of your habits this week.",
                "value": habit_rate
            })
        
        # Task insight
        if tasks_total > 0:
            task_rate = (tasks_completed / tasks_total) * 100
            insights.append({
                "type": "pattern",
                "title": "Schedule Follow-through",
                "description": f"You've completed {task_rate:.0f}% of scheduled tasks.",
                "value": task_rate
            })
        
        # Score trend
        if avg_score > 0:
            insights.append({
                "type": "achievement" if avg_score >= 70 else "warning",
                "title": "Weekly Average Score",
                "description": f"Your average daily score is {avg_score:.0f}/100.",
                "value": avg_score
            })
        
        return {"insights": insights, "period": "last_7_days"}
        
    except Exception as e:
        logger.error(f"Insights error: {str(e)}")
        return {"insights": [], "error": str(e)}

# ==================== SCHEDULE ENDPOINTS ====================

@api_router.get("/schedule/{user_id}/{date}")
async def get_schedule(user_id: str, date: str):
    items = await db.schedules.find({"user_id": user_id, "date": date}).sort("time", 1).to_list(100)
    return [ScheduleItem(**item) for item in items]

@api_router.put("/schedule/{item_id}/complete")
async def complete_schedule_item(item_id: str):
    await db.schedules.update_one({"id": item_id}, {"$set": {"completed": True}})
    return {"status": "completed", "points_earned": 10}

@api_router.get("/rik/next-task/{user_id}")
async def get_next_task(user_id: str):
    today = datetime.now().strftime("%Y-%m-%d")
    current_time = datetime.now().strftime("%H:%M")
    
    schedule = await db.schedules.find({
        "user_id": user_id,
        "date": today,
        "completed": False,
        "time": {"$gte": current_time}
    }).sort("time", 1).to_list(1)
    
    if schedule:
        return {"has_task": True, "task": schedule[0]}
    return {"has_task": False, "message": "No more tasks scheduled"}

@api_router.get("/rik/status/{user_id}")
async def get_rik_status(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_profile = UserProfile(**user)
    today = datetime.now().strftime("%Y-%m-%d")
    current_hour = datetime.now().hour
    
    schedule = await db.schedules.find({"user_id": user_id, "date": today}).to_list(100)
    habit_logs = await db.habit_logs.find({"user_id": user_id, "date": today}).to_list(100)
    
    greeting = "Good morning" if current_hour < 12 else "Good afternoon" if current_hour < 17 else "Good evening"
    
    return {
        "greeting": greeting,
        "name": user_profile.name,
        "schedule_completed": len([s for s in schedule if s.get('completed')]),
        "schedule_total": len(schedule),
        "habits_done": len([h for h in habit_logs if h.get('completed')]),
        "habits_total": len(user_profile.habits_to_build) + len(user_profile.habits_to_quit),
        "points": user_profile.points,
        "streak": user_profile.streak_days,
        "routine_learned": user_profile.routine_learned,
        "current_time": datetime.now().strftime("%H:%M")
    }

# ==================== HABITS ====================

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
    
    # Add points for completing habit
    if habit_data.completed:
        await db.users.update_one({"id": habit_data.user_id}, {"$inc": {"points": 5}})
    
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

# ==================== ANALYSIS ====================

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
        
        habits_done = len([h for h in habits if h.get('completed')])
        tasks_done = len([s for s in schedule if s.get('completed')])
        
        prompt = f"""
Analyze {user_profile.name}'s day as Rik (strict coach).

Goal: {user_profile.goal_role}
Habits: {habits_done}/{len(habits)} done
Tasks: {tasks_done}/{len(schedule)} done

Return JSON:
{{
    "summary": "2 sentences - direct assessment",
    "achievements": ["what they did well"],
    "improvements": ["what needs work"],
    "recommendations": ["specific action for tomorrow"],
    "overall_score": 75,
    "points_earned": {(habits_done * 5) + (tasks_done * 10)}
}}
"""
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        chat = LlmChat(
            api_key=api_key,
            session_id=f"analysis_{user_id}_{date}",
            system_message="Analyze performance. Return only JSON."
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        try:
            clean = response.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            data = json.loads(clean.strip())
        except:
            data = {"summary": "Day completed.", "achievements": [], "improvements": [], "recommendations": [], "overall_score": 50, "points_earned": 0}
        
        # Add points
        points = data.get("points_earned", 0)
        await db.users.update_one({"id": user_id}, {"$inc": {"points": points}})
        
        analysis = DailyAnalysis(
            user_id=user_id,
            date=date,
            summary=data.get("summary", ""),
            achievements=data.get("achievements", []),
            improvements=data.get("improvements", []),
            recommendations=data.get("recommendations", []),
            overall_score=data.get("overall_score", 50),
            points_earned=points
        )
        
        await db.daily_analysis.delete_many({"user_id": user_id, "date": date})
        await db.daily_analysis.insert_one(analysis.model_dump())
        
        return analysis
        
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/analysis/{user_id}/{date}")
async def get_daily_analysis(user_id: str, date: str):
    analysis = await db.daily_analysis.find_one({"user_id": user_id, "date": date})
    return DailyAnalysis(**analysis) if analysis else None

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
