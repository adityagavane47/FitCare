from fastapi import FastAPI, Depends, HTTPException, Body, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pathlib import Path
from dotenv import load_dotenv
from typing import List, Optional
from datetime import datetime, date
import random
import os
import httpx
import numpy as np
import json
import traceback

# Load .env before any os.getenv() calls
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

import models
import schemas
from database import engine, SessionLocal
import ai_trainer
from services.ai_trainer import generate_daily_insights, generate_post_workout_macros
from services.meal_evaluator import evaluate_meal

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="FitCare API",
    description="Backend API for the FitCare fitness application with TensorFlow LSTM form analysis.",
    version="3.0.0"
)

# CORS - allow all origins for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    """FastAPI dependency to get a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ====================================
#  TENSORFLOW LSTM FORM ANALYSIS
# ====================================

from services.form_model import get_form_model, SEQUENCE_LENGTH, FEATURES_PER_FRAME


@app.post("/api/form/analyze", response_model=schemas.FormAnalysisResponse)
def analyze_form_lstm(req: schemas.FormAnalysisRequest):
    """
    TensorFlow LSTM-based exercise form analysis.

    Accepts a sliding window of 30 frames of normalized pose landmarks
    and returns form correctness, per-joint status, and alerts.

    Input: JSON with exercise_type and landmark_sequence (30 frames × 99 values each).
    Output: Accuracy %, label confidences, alerts, and terminal-style joint status.
    """
    # Validate sequence dimensions
    sequence = req.landmark_sequence

    if len(sequence) != SEQUENCE_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"Expected {SEQUENCE_LENGTH} frames, received {len(sequence)}. "
                   f"Buffer the sliding window to exactly {SEQUENCE_LENGTH} frames before sending."
        )

    for i, frame in enumerate(sequence):
        if len(frame) != FEATURES_PER_FRAME:
            raise HTTPException(
                status_code=422,
                detail=f"Frame {i} has {len(frame)} values, expected {FEATURES_PER_FRAME} "
                       f"(33 landmarks × 3 coords)."
            )

    # Convert to numpy and reshape for the model: (1, 30, 99)
    try:
        sequence_array = np.array(sequence, dtype=np.float32).reshape(1, SEQUENCE_LENGTH, FEATURES_PER_FRAME)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse landmark data: {e}")

    # Run LSTM inference
    model = get_form_model()
    result = model.predict_form(sequence_array)
    result["exercise_type"] = req.exercise_type

    return result


# ====================================
#  POST-WORKOUT SESSION ANALYSIS
# ====================================

def _grade_session(avg_precision: float, total_reps: int, form_flags: list) -> str:
    """Calculate a letter grade for the workout session."""
    score = avg_precision
    # Penalize for form issues
    score -= len(form_flags) * 5
    # Bonus for rep count
    if total_reps >= 20:
        score += 5
    elif total_reps >= 10:
        score += 2

    if score >= 95:
        return "A+"
    elif score >= 85:
        return "A"
    elif score >= 75:
        return "B"
    elif score >= 60:
        return "C"
    elif score >= 45:
        return "D"
    return "F"


def _build_recommendations(exercise_type: str, form_flags: list) -> list:
    """Generate specific improvement tips based on detected form issues."""
    tips = {
        "hips": "Focus on core engagement — practice planks to build stability for a straighter body line.",
        "elbows": "Keep elbows at 45° angle from your torso. Imagine screwing your hands into the floor.",
        "knees": "Place a resistance band above your knees during squats to train outward knee tracking.",
        "spine": "Practice cat-cow stretches and dead bugs to improve spinal awareness under load.",
        "not_deep_enough": "Work on mobility first — use box squats or incline pushups to build range of motion.",
    }
    recommendations = []
    for flag in form_flags:
        flag_lower = flag.lower()
        for key, tip in tips.items():
            if key in flag_lower:
                recommendations.append(tip)
                break
    if not recommendations:
        recommendations.append("Great session! Maintain consistency and gradually increase difficulty.")
    return recommendations


@app.post("/api/workout/analyze-session", response_model=schemas.SessionAnalysisResponse)
async def analyze_session(req: schemas.SessionAnalysisRequest):
    """
    Post-workout session analysis endpoint.

    Accepts a summary of the completed workout (reps, precision, form flags)
    and returns an AI-generated coaching summary with a grade and recommendations.
    Uses local Ollama for the AI summary when available, otherwise falls back
    to a deterministic response.
    """
    grade = _grade_session(req.avg_precision, req.total_reps, req.form_flags)
    recommendations = _build_recommendations(req.exercise_type, req.form_flags)

    # Build a coaching summary prompt for Ollama
    duration_min = round(req.duration_seconds / 60, 1)
    flag_str = ", ".join(req.form_flags) if req.form_flags else "none detected"

    prompt = (
        f"You are a concise fitness coach. Summarize this workout session in 2-3 sentences.\n"
        f"Exercise: {req.exercise_type}\n"
        f"Reps completed: {req.total_reps}\n"
        f"Average form precision: {req.avg_precision}%\n"
        f"Duration: {duration_min} minutes\n"
        f"Form issues detected: {flag_str}\n"
        f"Grade: {grade}\n"
        f"Give encouraging but honest feedback. Be specific about what to improve."
    )

    # Try Ollama for AI summary
    summary = ""
    OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": os.getenv("OLLAMA_MODEL", "phi3"),
                    "prompt": prompt,
                    "stream": False,
                },
            )
        if resp.status_code == 200:
            data = resp.json()
            summary = data.get("response", "").strip()
    except Exception as e:
        print(f"[SessionAnalysis] Ollama unavailable: {e}")

    # Fallback summary if Ollama is not available
    if not summary:
        if grade in ("A+", "A"):
            summary = (
                f"Excellent {req.exercise_type} session! You completed {req.total_reps} reps "
                f"in {duration_min} minutes with {req.avg_precision:.0f}% precision. "
                f"Your form was outstanding — keep up the great work."
            )
        elif grade in ("B", "C"):
            summary = (
                f"Solid {req.exercise_type} session with {req.total_reps} reps. "
                f"Your precision averaged {req.avg_precision:.0f}%. "
                f"Focus on: {flag_str}. Improving these will take you to the next level."
            )
        else:
            summary = (
                f"You completed {req.total_reps} {req.exercise_type} reps in {duration_min} minutes. "
                f"Precision was {req.avg_precision:.0f}% — there's room for improvement. "
                f"Key areas to work on: {flag_str}. Consider reducing reps and focusing on form."
            )

    return {
        "summary": summary,
        "grade": grade,
        "recommendations": recommendations,
    }



# ====================================
#  HEALTH CHECK
# ====================================

@app.get("/")
def root():
    return {"status": "online", "message": "FitCare API v3.0 — TensorFlow LSTM Form Analysis Active"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "engine": "tensorflow_lstm", "version": "3.0.0"}


# ====================================
#  USER MANAGEMENT
# ====================================

@app.post("/api/users/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    """Registers a new user in the system."""
    existing = db.query(models.UserDB).filter(models.UserDB.phone == user.phone).first()
    if existing:
        raise HTTPException(status_code=400, detail="Phone number already registered.")

    new_user = models.UserDB(**user.model_dump())
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.post("/api/auth/request-otp", response_model=schemas.OTPResponse)
def request_otp(req: schemas.OTPRequest, db: Session = Depends(get_db)):
    """Request OTP for phone-based authentication (mock implementation)."""
    # Generate a mock OTP (in production, integrate with SMS provider)
    otp = str(random.randint(1000, 9999))
    
    # Print the OTP to terminal instead of returning it for security
    print(f"\n==========================================")
    print(f"🔒 MOCK OTP FOR {req.phone}: {otp}")
    print(f"==========================================\n")
    
    # In production, store OTP in cache (Redis) with expiration
    return {"message": f"OTP sent to {req.phone}"}


@app.post("/api/auth/verify-otp", response_model=schemas.OTPVerifyResponse)
def verify_otp(req: schemas.OTPVerify, db: Session = Depends(get_db)):
    """Verify OTP and return/create user."""
    # In production, verify OTP from cache
    # For now, accept any 4-digit OTP
    if len(req.otp) != 4:
        raise HTTPException(status_code=400, detail="Invalid OTP format.")

    is_new_user = False
    user = db.query(models.UserDB).filter(models.UserDB.phone == req.phone).first()
    if not user:
        # Auto-register new user on first OTP verification
        is_new_user = True
        user = models.UserDB(phone=req.phone)
        db.add(user)
        db.commit()
        db.refresh(user)

    return {
        "user_id": user.id,
        "is_new_user": is_new_user,
        "phone": user.phone,
        "name": user.name
    }


@app.post("/api/users/onboard", response_model=schemas.UserResponse)
def onboard_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    """Onboard a new user with profile details after OTP verification."""
    existing = db.query(models.UserDB).filter(models.UserDB.phone == user.phone).first()
    if existing:
        # Update existing user with onboarding data
        for field, value in user.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return existing

    # Create new user
    new_user = models.UserDB(**user.model_dump())
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.get("/api/users/{user_id}", response_model=schemas.UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    """Returns user details by ID."""
    user = db.query(models.UserDB).filter(models.UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@app.put("/api/users/{user_id}", response_model=schemas.UserResponse)
def update_user(user_id: int, updates: schemas.UserUpdate, db: Session = Depends(get_db)):
    """Updates user profile information."""
    user = db.query(models.UserDB).filter(models.UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


# ====================================
#  AI DAILY INSIGHTS
# ====================================

@app.get("/api/user/{user_id}/insights")
def get_daily_insights(user_id: int, db: Session = Depends(get_db)):
    """
    Fetches personalised daily insights (quote, fact, target) for a user
    by passing their profile to the local Ollama Phi-3 model.
    """
    user = db.query(models.UserDB).filter(models.UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if not all([user.age, user.weight_kg, user.height_cm, user.fitness_goal]):
        raise HTTPException(
            status_code=400,
            detail="Complete your profile (age, height, weight, fitness goal) to get insights."
        )

    insights = generate_daily_insights(
        age=user.age,
        weight=user.weight_kg,
        height=user.height_cm,
        goal=user.fitness_goal,
    )
    return JSONResponse(content=insights)


# ====================================
#  WORKOUT LOGGING
# ====================================

CALORIE_MULTIPLIERS = {
    "Cardio": 10,
    "Strength": 6,
    "Yoga": 4,
    "Combat": 8,
}

@app.post("/api/workout/log")
async def log_workout(workout: schemas.WorkoutLogCreate, db: Session = Depends(get_db)):
    """Logs a completed workout session with dynamic macro engine integration."""
    # Calculate estimated calories: duration_minutes * category multiplier
    category = workout.exercise_category or "Strength"
    multiplier = CALORIE_MULTIPLIERS.get(category, 4)
    estimated_calories = int(workout.duration_minutes * multiplier)

    # Store estimated calories on the workout log
    workout_data = workout.model_dump()
    workout_data["dynamic_calories"] = estimated_calories

    new_log = models.WorkoutLog(**workout_data)
    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    # Call AI engine for post-workout macro adjustments
    macro_adjustments = await generate_post_workout_macros(
        exercise_category=category,
        duration_minutes=workout.duration_minutes,
        estimated_calories=estimated_calories
    )

    return JSONResponse(content={
        "status": "success",
        "estimated_calories": estimated_calories,
        "macro_adjustments": macro_adjustments,
        "workout_log": {
            "id": new_log.id,
            "user_id": new_log.user_id,
            "exercise_type": new_log.exercise_type,
            "exercise_category": new_log.exercise_category,
            "exercise_name": new_log.exercise_name,
            "duration_minutes": new_log.duration_minutes,
            "logged_at": new_log.logged_at.isoformat(),
        }
    })


@app.get("/api/workout/history/{user_id}", response_model=List[schemas.WorkoutLogResponse])
def get_user_workouts(user_id: int, db: Session = Depends(get_db)):
    """Returns all workout logs for a user, most recent first."""
    return db.query(models.WorkoutLog).filter(
        models.WorkoutLog.user_id == user_id
    ).order_by(models.WorkoutLog.logged_at.desc()).all()


# ====================================
#  NUTRITION PLANNER - MIFFLIN-ST JEOR
# ====================================

ACTIVITY_MULTIPLIERS = {
    "beginner": 1.375,      # Light exercise 1-3 days/week
    "intermediate": 1.55,   # Moderate exercise 3-5 days/week
    "advanced": 1.725,      # Hard exercise 6-7 days/week
}

GOAL_CALORIE_DELTA = {
    "lose": -500,       # 500 kcal deficit -> ~0.5 kg/week loss
    "gain": +300,       # 300 kcal surplus -> lean bulk
    "maintain": 0,
}


def _calculate_nutrition(user: models.UserDB) -> dict:
    """
    Implements the Mifflin-St Jeor BMR equation and derives TDEE + macro targets.
    """
    if not all([user.age, user.gender, user.height_cm, user.weight_kg]):
        raise HTTPException(
            status_code=400,
            detail="Complete your profile (age, gender, height, weight) before generating a plan."
        )

    w = user.weight_kg
    h = user.height_cm
    a = user.age

    if user.gender == "male":
        bmr = 10 * w + 6.25 * h - 5 * a + 5
    else:
        bmr = 10 * w + 6.25 * h - 5 * a - 161

    multiplier = ACTIVITY_MULTIPLIERS.get(user.activity_level, 1.375)
    tdee = bmr * multiplier
    goal_delta = GOAL_CALORIE_DELTA.get(user.fitness_goal, 0)
    target = tdee + goal_delta

    protein_g = round(w * 2.0, 1)              # 2g per kg bodyweight
    fat_g = round((target * 0.25) / 9, 1)      # 25% of calories from fat
    carbs_kcal = target - (protein_g * 4) - (fat_g * 9)
    carbs_g = round(carbs_kcal / 4, 1)

    return {
        "bmr": round(bmr, 1),
        "tdee": round(tdee, 1),
        "target_calories": round(target, 1),
        "protein_g": protein_g,
        "carbs_g": max(carbs_g, 0),
        "fat_g": fat_g,
    }


@app.post("/api/nutrition/generate", response_model=schemas.NutritionPlanResponse)
def generate_nutrition_plan(req: schemas.NutritionRequest, db: Session = Depends(get_db)):
    """
    Calculates a personalised nutrition plan using the Mifflin-St Jeor equation.
    Saves the plan to the database and returns it, additionally hitting Ollama for a sample plan.
    """
    user = db.query(models.UserDB).filter(models.UserDB.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    nutrition = _calculate_nutrition(user)

    # Send calculated macros to Ollama Phi-3 locally
    ai_meal_plan_text = ai_trainer.generate_meal_plan_ollama(
        user_goal=user.fitness_goal,
        calories=nutrition["target_calories"],
        protein=nutrition["protein_g"],
        carbs=nutrition["carbs_g"],
        fats=nutrition["fat_g"]
    )

    nutrition["ai_meal_plan"] = ai_meal_plan_text

    plan = models.NutritionPlan(user_id=user.id, **nutrition)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@app.get("/api/nutrition/plan/{user_id}", response_model=schemas.NutritionPlanResponse)
def get_latest_nutrition_plan(user_id: int, db: Session = Depends(get_db)):
    """Returns the most recently generated nutrition plan for a user."""
    plan = db.query(models.NutritionPlan)\
             .filter(models.NutritionPlan.user_id == user_id)\
             .order_by(models.NutritionPlan.generated_at.desc())\
             .first()

    if not plan:
        raise HTTPException(
            status_code=404,
            detail="No nutrition plan found. Call POST /api/nutrition/generate first."
        )
    return plan


# ====================================
#  FOOD SEARCH (USDA FoodData Central + Fallback)
# ====================================

# USDA FoodData Central API (primary food search provider)
USDA_API_KEY = os.getenv("USDA_API_KEY", "")
USDA_API_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"

# USDA Nutrient IDs for macro extraction
USDA_NUTRIENT_MAP = {
    1008: "calories",   # Energy (KCAL)
    1003: "protein",    # Protein (G)
    1005: "carbs",      # Carbohydrate, by difference (G)
    1004: "fats",       # Total lipid / fat (G)
}


def _parse_usda_food(food_item: dict) -> dict:
    """Extract macro nutrients from a USDA FDC food search result."""
    macros = {"calories": 0, "protein": 0, "carbs": 0, "fats": 0}
    for nutrient in food_item.get("foodNutrients", []):
        nid = nutrient.get("nutrientId")
        if nid in USDA_NUTRIENT_MAP:
            macros[USDA_NUTRIENT_MAP[nid]] = round(nutrient.get("value", 0), 1)
    return {
        "id": str(food_item.get("fdcId", "")),
        "name": food_item.get("description", "Unknown").title(),
        **macros,
    }


# Dummy food database for when no API key is available
DUMMY_FOOD_DB = [
    {"id": "food_001", "name": "Grilled Chicken Breast", "calories": 284, "protein": 53, "carbs": 0, "fats": 6},
    {"id": "food_002", "name": "Chicken Biryani", "calories": 490, "protein": 22, "carbs": 58, "fats": 18},
    {"id": "food_003", "name": "Masala Omelette", "calories": 220, "protein": 16, "carbs": 4, "fats": 16},
    {"id": "food_004", "name": "Paneer Tikka", "calories": 320, "protein": 18, "carbs": 8, "fats": 24},
    {"id": "food_005", "name": "Egg Fried Rice", "calories": 410, "protein": 12, "carbs": 62, "fats": 14},
    {"id": "food_006", "name": "Whey Protein Shake", "calories": 130, "protein": 25, "carbs": 3, "fats": 2},
    {"id": "food_007", "name": "Peanut Butter Toast", "calories": 310, "protein": 12, "carbs": 32, "fats": 16},
    {"id": "food_008", "name": "Greek Yogurt Bowl", "calories": 180, "protein": 18, "carbs": 12, "fats": 6},
    {"id": "food_009", "name": "Salmon Sushi Roll", "calories": 350, "protein": 20, "carbs": 42, "fats": 10},
    {"id": "food_010", "name": "Caesar Salad", "calories": 260, "protein": 14, "carbs": 12, "fats": 18},
    {"id": "food_011", "name": "Steak and Potatoes", "calories": 680, "protein": 48, "carbs": 40, "fats": 32},
    {"id": "food_012", "name": "Veggie Wrap", "calories": 290, "protein": 10, "carbs": 38, "fats": 12},
    {"id": "food_013", "name": "Chocolate Brownie", "calories": 380, "protein": 5, "carbs": 50, "fats": 18},
    {"id": "food_014", "name": "Dal Tadka with Rice", "calories": 420, "protein": 16, "carbs": 64, "fats": 10},
    {"id": "food_015", "name": "Banana Smoothie", "calories": 220, "protein": 6, "carbs": 44, "fats": 3},
]


@app.get("/api/food/search")
async def search_food(
    query: str = Query(..., min_length=1, description="Dish name to search"),
    usda_key: Optional[str] = Query(None, description="USDA API key (overrides server env)"),
):
    """
    Searches for food items by name.
    Uses the USDA FoodData Central API if an API key is provided
    (via query param or server env), otherwise falls back to a local
    dummy database.
    """
    # Resolve the active key: prefer client-provided, then server env
    active_key = usda_key or USDA_API_KEY

    # Try USDA FoodData Central API if a key is available
    if active_key:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    USDA_API_URL,
                    params={
                        "api_key": active_key,
                        "query": query,
                        "pageSize": 10,
                    },
                )
            if resp.status_code == 200:
                data = resp.json()
                results = [
                    _parse_usda_food(food)
                    for food in data.get("foods", [])[:10]
                ]
                return {"source": "usda", "results": results}
            else:
                print(f"[FoodSearch] USDA API error [{resp.status_code}]: {resp.text}")
        except Exception as e:
            print(f"[FoodSearch] USDA API request failed: {e}")

    # Fallback: filter dummy database by query (case-insensitive partial match)
    query_lower = query.lower()
    matches = [item for item in DUMMY_FOOD_DB if query_lower in item["name"].lower()]

    # If no exact matches, return all items sorted by relevance
    if not matches:
        matches = DUMMY_FOOD_DB[:8]

    return {"source": "local", "results": matches}


# ====================================
#  FOOD LOGGING (In-Memory + AI Eval)
# ====================================

class FoodLogCreate(BaseModel):
    """Schema for logging a single food item's macros."""
    food_name: str
    calories: float
    protein_g: float = 0.0
    carbs_g: float = 0.0
    fats_g: float = 0.0
    user_goal: Optional[str] = None

# In-memory store: { "YYYY-MM-DD": [ {food_name, calories, ...}, ... ] }
daily_food_logs: dict[str, list] = {}

# Default user goal used when none is provided
DEFAULT_USER_GOAL = "Muscle Hypertrophy"


@app.post("/api/food/log")
def log_food(entry: FoodLogCreate):
    """
    Logs a food item to today's in-memory ledger, then runs
    the meal through the AI evaluator for personalised feedback.
    """
    today = date.today().isoformat()  # "YYYY-MM-DD"
    if today not in daily_food_logs:
        daily_food_logs[today] = []

    entry_data = entry.model_dump()
    daily_food_logs[today].append(entry_data)

    # Run AI meal evaluation
    user_goal = entry.user_goal or DEFAULT_USER_GOAL
    macros = {
        "calories": entry.calories,
        "protein": entry.protein_g,
        "carbs": entry.carbs_g,
        "fats": entry.fats_g,
    }
    ai_feedback = evaluate_meal(
        food_name=entry.food_name,
        macros=macros,
        user_goal=user_goal,
    )

    return {
        "status": "success",
        "date": today,
        "logged": entry_data,
        "ai_feedback": ai_feedback,
    }


@app.get("/api/nutrition/today")
def get_today_nutrition():
    """
    Returns aggregated calories & protein for today plus default daily goals.
    """
    today = date.today().isoformat()
    logs = daily_food_logs.get(today, [])
    total_calories = sum(l["calories"] for l in logs)
    total_protein = sum(l["protein_g"] for l in logs)
    return {
        "date": today,
        "total_calories": round(total_calories, 1),
        "total_protein": round(total_protein, 1),
        "calorie_goal": 2500,
        "protein_goal": 150,
        "items_logged": len(logs),
    }


# ====================================
#  AI TRAINER CHAT
# ====================================

@app.post("/api/trainer/chat", response_model=schemas.TrainerChatResponse)
def chat_with_trainer(req: schemas.TrainerChatRequest, db: Session = Depends(get_db)):
    """
    Sends a message to the AI Trainer.
    The trainer response is personalised using the user's fitness goal and body metrics.
    """
    user = None
    if req.user_id:
        user = db.query(models.UserDB).filter(models.UserDB.id == req.user_id).first()

    user_context = {
        "goal": user.fitness_goal if user else "maintain",
        "age": user.age if user else "unknown",
        "gender": user.gender if user else "unknown",
        "weight": user.weight_kg if user else "unknown",
        "height": user.height_cm if user else "unknown",
        "activity_level": user.activity_level if user else "unknown"
    }

    reply = ai_trainer.get_fitness_advice(req.message, user_context)
    return {"reply": reply}


@app.get("/api/trainer/status")
def get_trainer_status():
    """
    Checks if the local Ollama instance is awake and responding.
    """
    import requests
    OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    try:
        res = requests.get(OLLAMA_URL, timeout=2)
        if res.status_code == 200:
            return {"status": "online", "message": "Ollama is running locally."}
    except Exception:
        pass
    return {"status": "offline", "message": "Ollama is not reachable. Run 'ollama run phi3'."}


@app.post("/api/workout/analysis", response_model=schemas.WorkoutAnalysisResponse)
def analyze_workout_form(req: schemas.WorkoutAnalysisRequest, db: Session = Depends(get_db)):
    """
    Takes form flags (e.g. ['hips_sagging', 'not_deep_enough']) detected by BlazePose
    and uses local Ollama Phi-3 to return an encouraging coaching summary.
    """
    summary = ai_trainer.analyze_form_flags(req.exercise_type, req.form_flags)
    return {"feedback": summary}
