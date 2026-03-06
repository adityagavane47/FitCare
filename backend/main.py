from fastapi import FastAPI, Depends, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pathlib import Path
from dotenv import load_dotenv
from typing import List
from datetime import datetime
import random
import os

# Load .env before any os.getenv() calls
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

import models
import schemas
from database import engine, get_db
from services import ai_trainer

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="FitCare API", version="1.0.0", description="FitCare backend — FastAPI + SQLite")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory OTP store (phone -> otp). Replace with Redis or a real SMS provider in production.
_otp_store: dict[str, str] = {}


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get("/")
def health_check():
    return {"status": "FITCARE_READY", "version": "1.0.0"}


from twilio.rest import Client
from twilio.http.http_client import TwilioHttpClient

# Initialize Twilio Client (with a 10-second timeout so OTP never hangs)
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE = os.getenv("TWILIO_PHONE_NUMBER")
if TWILIO_SID and TWILIO_TOKEN:
    _http = TwilioHttpClient(timeout=10)
    twilio_client = Client(TWILIO_SID, TWILIO_TOKEN, http_client=_http)
else:
    twilio_client = None

# ==========================================
# 1. AUTHENTICATION — OTP FLOW
# ==========================================

@app.post("/api/auth/request-otp", response_model=schemas.OTPResponse)
def request_otp(body: schemas.OTPRequest):
    if len(body.phone) < 10 or not body.phone.isdigit():
        raise HTTPException(status_code=400, detail="Enter a valid phone number (at least 10 digits).")

    otp = str(random.randint(1000, 9999))
    _otp_store[body.phone] = otp
    print(f"[DEV] OTP generated for {body.phone}: {otp}")

    # Dispatch via Twilio if configured
    if twilio_client and TWILIO_PHONE:
        try:
            # Twilio requires E.164 format. Ensure country code is prefixed if needed.
            formatted_phone = f"+91{body.phone}" if len(body.phone) == 10 else f"+{body.phone}"
            
            message = twilio_client.messages.create(
                body=f"Your FitCare verification code is: {otp}. It expires in 5 minutes.",
                from_=TWILIO_PHONE,
                to=formatted_phone
            )
            print(f"[Twilio] SMS Dispatched (SID: {message.sid}) to {formatted_phone}")
            return {"message": "OTP SMS sent successfully", "otp": ""}
            
        except Exception as e:
            print(f"[Twilio ERROR] SMS Sending Failed: {e}")
            return {"message": "OTP generated (but SMS failed to send) - using dev mode", "otp": otp}

    # Fallback to dev mode if Twilio is entirely missing
    return {"message": "OTP generated (Twilio offline) - using dev mode", "otp": otp}


@app.post("/api/auth/verify-otp")
def verify_otp(body: schemas.OTPVerify, db: Session = Depends(get_db)):
    """
    Verifies OTP. If correct, creates the user record (phone only) if it doesn't exist,
    and returns the user_id for use in subsequent API calls.
    """
    stored = _otp_store.get(body.phone)
    if not stored or stored != body.otp:
        raise HTTPException(status_code=401, detail="Invalid or expired OTP.")

    del _otp_store[body.phone]

    user = db.query(models.UserDB).filter(models.UserDB.phone == body.phone).first()
    if not user:
        user = models.UserDB(phone=body.phone)
        db.add(user)
        db.commit()
        db.refresh(user)

    is_new = user.name is None
    return {"user_id": user.id, "is_new_user": is_new, "message": "Authentication successful"}


# ==========================================
# 2. USER PROFILE — ONBOARDING & CRUD
# ==========================================

@app.post("/api/users/onboard", response_model=schemas.UserResponse)
def onboard_user(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    """
    Saves full fitness profile after OTP verification.
    Called at the end of the multi-step onboarding screen.
    """
    user = db.query(models.UserDB).filter(models.UserDB.phone == user_data.phone).first()

    if not user:
        user = models.UserDB()

    user.phone = user_data.phone
    user.name = user_data.name
    user.email = user_data.email
    user.age = user_data.age
    user.gender = user_data.gender
    user.height_cm = user_data.height_cm
    user.weight_kg = user_data.weight_kg
    user.fitness_goal = user_data.fitness_goal
    user.activity_level = user_data.activity_level

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.get("/api/users/{user_id}", response_model=schemas.UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.UserDB).filter(models.UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@app.put("/api/users/{user_id}", response_model=schemas.UserResponse)
def update_user(user_id: int, update: schemas.UserUpdate, db: Session = Depends(get_db)):
    user = db.query(models.UserDB).filter(models.UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    for field, value in update.model_dump(exclude_none=True).items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


# ==========================================
# 3. WORKOUT LOGGING
# ==========================================

@app.post("/api/workout/log", response_model=schemas.WorkoutLogResponse)
def log_workout(log: schemas.WorkoutLogCreate, db: Session = Depends(get_db)):
    """
    Receives a workout log entry — typically sent from the wearable bridge service
    or manually from the WorkoutScreen.
    """
    user = db.query(models.UserDB).filter(models.UserDB.id == log.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    db_log = models.WorkoutLog(**log.model_dump())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log


@app.get("/api/workout/history/{user_id}", response_model=List[schemas.WorkoutLogResponse])
def get_workout_history(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.UserDB).filter(models.UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return db.query(models.WorkoutLog).filter(models.WorkoutLog.user_id == user_id)\
             .order_by(models.WorkoutLog.logged_at.desc()).all()


# ==========================================
# 4. NUTRITION PLANNER — MIFFLIN-ST JEOR
# ==========================================

ACTIVITY_MULTIPLIERS = {
    "beginner": 1.375,      # Light exercise 1-3 days/week
    "intermediate": 1.55,   # Moderate exercise 3-5 days/week
    "advanced": 1.725,      # Hard exercise 6-7 days/week
}

GOAL_CALORIE_DELTA = {
    "lose": -500,       # 500 kcal deficit → ~0.5 kg/week loss
    "gain": +300,       # 300 kcal surplus → lean bulk
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


# ==========================================
# 5. AI TRAINER CHAT
# ==========================================

@app.post("/api/trainer/chat", response_model=schemas.TrainerChatResponse)
def chat_with_trainer(req: schemas.TrainerChatRequest, db: Session = Depends(get_db)):
    """
    Sends a message to the AI Trainer.
    The trainer response is personalised using the user's fitness goal.
    """
    user = db.query(models.UserDB).filter(models.UserDB.id == req.user_id).first()
    user_goal = user.fitness_goal if user else "maintain"

    reply = ai_trainer.get_fitness_advice(req.message, user_goal)
    return {"reply": reply}
