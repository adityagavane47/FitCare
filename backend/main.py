from fastapi import FastAPI, Depends, HTTPException, Body, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pathlib import Path
from dotenv import load_dotenv
from typing import List
from datetime import datetime
import random
import os
import cv2
import mediapipe as mp
import numpy as np
import base64
import math
import json

# Load .env before any os.getenv() calls
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

import models
import schemas
from database import engine, SessionLocal
import ai_trainer

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="FitCare API",
    description="Backend API for the FitCare fitness application with AI-powered form correction.",
    version="2.0.0"
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
#  MEDIAPIPE FORM TRACKER (WebSocket)
# ====================================

# Lazy initialization for MediaPipe Pose (initialized on first use)
mp_pose = None

def get_pose_detector():
    """Get or create the MediaPipe Pose detector (lazy initialization)."""
    global mp_pose
    if mp_pose is None:
        mp_pose = mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
    return mp_pose


def calculate_angle(a, b, c):
    """
    Calculate the angle ABC (at point B) using three landmark points.

    This uses the atan2 function to compute the angle between two vectors:
    - Vector BA (from B to A)
    - Vector BC (from B to C)

    The formula:
    1. Compute angle of BA relative to x-axis: atan2(a.y - b.y, a.x - b.x)
    2. Compute angle of BC relative to x-axis: atan2(c.y - b.y, c.x - b.x)
    3. The angle at B = difference between these two angles
    4. Convert from radians to degrees

    Args:
        a: First point (e.g., shoulder) with x, y coordinates
        b: Middle point / vertex (e.g., hip) with x, y coordinates
        c: Third point (e.g., ankle) with x, y coordinates

    Returns:
        Angle in degrees (0-360 range, normalized)
    """
    radians = math.atan2(c[1] - b[1], c[0] - b[0]) - math.atan2(a[1] - b[1], a[0] - b[0])
    angle = abs(radians * 180.0 / math.pi)

    # Normalize to 0-180 range
    if angle > 180.0:
        angle = 360.0 - angle

    return angle


@app.websocket("/ws/form-tracker")
async def form_tracker_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time pose analysis using MediaPipe.

    Receives base64-encoded camera frames from the mobile app,
    processes them through MediaPipe Pose, and returns form feedback.

    For pushups, we check the alignment of shoulder-hip-ankle to ensure
    the user maintains a straight back (plank position).
    """
    await websocket.accept()
    print("[WebSocket] Client connected to /ws/form-tracker")

    try:
        while True:
            # Await base64 image data from client
            data = await websocket.receive_text()

            try:
                # Decode base64 string to numpy array
                img_bytes = base64.b64decode(data)
                np_arr = np.frombuffer(img_bytes, dtype=np.uint8)

                # Decode to OpenCV image (BGR format)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                if frame is None:
                    # Frame decoding failed, skip this frame
                    continue

                # Convert BGR to RGB for MediaPipe
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                # Process frame with MediaPipe Pose
                pose_detector = get_pose_detector()
                results = pose_detector.process(frame_rgb)

                if results.pose_landmarks is None:
                    # No pose detected in frame
                    await websocket.send_text(json.dumps({
                        "status": "success",
                        "feedback": "No person detected"
                    }))
                    continue

                # Extract landmarks
                landmarks = results.pose_landmarks.landmark

                # Get key points for back alignment check
                # Using LEFT side landmarks (can also check RIGHT side)
                left_shoulder = [
                    landmarks[mp.solutions.pose.PoseLandmark.LEFT_SHOULDER.value].x,
                    landmarks[mp.solutions.pose.PoseLandmark.LEFT_SHOULDER.value].y
                ]
                left_hip = [
                    landmarks[mp.solutions.pose.PoseLandmark.LEFT_HIP.value].x,
                    landmarks[mp.solutions.pose.PoseLandmark.LEFT_HIP.value].y
                ]
                left_ankle = [
                    landmarks[mp.solutions.pose.PoseLandmark.LEFT_ANKLE.value].x,
                    landmarks[mp.solutions.pose.PoseLandmark.LEFT_ANKLE.value].y
                ]

                # Calculate the angle at the hip (shoulder-hip-ankle alignment)
                # A straight back during a pushup should have this angle close to 180°
                angle = calculate_angle(left_shoulder, left_hip, left_ankle)

                # Determine feedback based on angle
                # Ideal range: 165° to 195° (allowing 15° tolerance from perfect 180°)
                if angle < 165 or angle > 195:
                    feedback = "Fix your back. Keep it straight."
                else:
                    feedback = "Good form."

                # Send response back to client
                await websocket.send_text(json.dumps({
                    "status": "success",
                    "feedback": feedback,
                    "angle": round(angle, 1)
                }))

            except Exception as e:
                # Frame processing error - log and continue (don't crash the server)
                print(f"[WebSocket] Frame processing error: {e}")
                continue

    except WebSocketDisconnect:
        print("[WebSocket] Client disconnected")
    except Exception as e:
        print(f"[WebSocket] Connection error: {e}")


# ====================================
#  HEALTH CHECK
# ====================================

@app.get("/")
def root():
    return {"status": "online", "message": "FitCare API v2.0 - MediaPipe Form Tracker Active"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "mediapipe": "initialized"}


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


@app.post("/api/otp/request", response_model=schemas.OTPResponse)
def request_otp(req: schemas.OTPRequest, db: Session = Depends(get_db)):
    """Request OTP for phone-based authentication (mock implementation)."""
    # Generate a mock OTP (in production, integrate with SMS provider)
    otp = str(random.randint(1000, 9999))
    # In production, store OTP in cache (Redis) with expiration
    return {"message": f"OTP sent to {req.phone}", "otp": otp}


@app.post("/api/otp/verify", response_model=schemas.UserResponse)
def verify_otp(req: schemas.OTPVerify, db: Session = Depends(get_db)):
    """Verify OTP and return/create user."""
    # In production, verify OTP from cache
    # For now, accept any 4-digit OTP
    if len(req.otp) != 4:
        raise HTTPException(status_code=400, detail="Invalid OTP format.")

    user = db.query(models.UserDB).filter(models.UserDB.phone == req.phone).first()
    if not user:
        # Auto-register new user on first OTP verification
        user = models.UserDB(phone=req.phone)
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


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
#  WORKOUT LOGGING
# ====================================

@app.post("/api/workouts/log", response_model=schemas.WorkoutLogResponse)
def log_workout(workout: schemas.WorkoutLogCreate, db: Session = Depends(get_db)):
    """Logs a completed workout session."""
    new_log = models.WorkoutLog(**workout.model_dump())
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    return new_log


@app.get("/api/workouts/{user_id}", response_model=List[schemas.WorkoutLogResponse])
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
#  AI TRAINER CHAT
# ====================================

@app.post("/api/trainer/chat", response_model=schemas.TrainerChatResponse)
def chat_with_trainer(req: schemas.TrainerChatRequest, db: Session = Depends(get_db)):
    """
    Sends a message to the AI Trainer.
    The trainer response is personalised using the user's fitness goal and body metrics.
    """
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
