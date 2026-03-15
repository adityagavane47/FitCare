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
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import base64
import math
import json
import traceback

# Load .env before any os.getenv() calls
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

import models
import schemas
from database import engine, SessionLocal
import ai_trainer
from services.ai_trainer import generate_daily_insights, generate_post_workout_macros

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

# Lazy initialization for MediaPipe Pose Landmarker (initialized on first use)
pose_landmarker = None

# Landmark indices for pose analysis (MediaPipe Pose Landmarker)
class PoseLandmark:
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28

def get_pose_detector():
    """Get or create the MediaPipe Pose Landmarker (lazy initialization)."""
    global pose_landmarker
    if pose_landmarker is None:
        model_path = Path(__file__).resolve().parent / "pose_landmarker.task"
        base_options = python.BaseOptions(model_asset_path=str(model_path))
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            min_pose_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        pose_landmarker = vision.PoseLandmarker.create_from_options(options)
    return pose_landmarker


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

    Features:
    1. Entry State Mechanism - Only evaluates when user is in horizontal pushup position
    2. Repetition Counter - Tracks elbow angle to count perfect-form pushups
    """
    await websocket.accept()
    print("[WebSocket] Client connected to /ws/form-tracker")

    # Initialize rep counter and stage BEFORE the loop
    rep_count = 0
    stage = None  # "up" or "down"
    frame_count = 0

    try:
        while True:
            # Await base64 image data from client
            data = await websocket.receive_text()
            frame_count += 1
            if frame_count <= 3 or frame_count % 20 == 0:
                print(f"[Frame {frame_count}] received")

            try:
                # Decode base64 string to numpy array
                img_bytes = base64.b64decode(data)
                np_arr = np.frombuffer(img_bytes, dtype=np.uint8)

                # Decode to OpenCV image (BGR format)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                if frame is None:
                    # Frame decoding failed, skip this frame
                    await websocket.send_text(json.dumps({
                        "status": "success",
                        "feedback": "Frame error",
                        "count": rep_count,
                        "elbow_angle": 0.0,
                        "back_angle": 0.0
                    }))
                    continue

                # Resize to smaller size for faster processing
                h, w = frame.shape[:2]

                # Target size: 480p for fast processing
                target_size = 480
                scale = target_size / max(h, w)
                new_w = int(w * scale)
                new_h = int(h * scale)
                frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)

                # Make square to avoid MediaPipe ROI warnings
                size = max(new_h, new_w)
                square_frame = np.zeros((size, size, 3), dtype=np.uint8)
                y_offset = (size - new_h) // 2
                x_offset = (size - new_w) // 2
                square_frame[y_offset:y_offset+new_h, x_offset:x_offset+new_w] = frame

                # Convert BGR to RGB for MediaPipe
                frame_rgb = cv2.cvtColor(square_frame, cv2.COLOR_BGR2RGB)

                # Create MediaPipe Image from numpy array
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

                # Process frame with MediaPipe Pose Landmarker
                detector = get_pose_detector()
                results = detector.detect(mp_image)

                if not results.pose_landmarks or len(results.pose_landmarks) == 0:
                    # No pose detected in frame
                    await websocket.send_text(json.dumps({
                        "status": "success",
                        "feedback": "No person detected",
                        "count": rep_count,
                        "elbow_angle": 0.0,
                        "back_angle": 0.0
                    }))
                    continue

                # Extract landmarks from first detected pose
                landmarks = results.pose_landmarks[0]

                # Extract all required landmarks (LEFT side)
                left_shoulder = [
                    landmarks[PoseLandmark.LEFT_SHOULDER].x,
                    landmarks[PoseLandmark.LEFT_SHOULDER].y
                ]
                left_elbow = [
                    landmarks[PoseLandmark.LEFT_ELBOW].x,
                    landmarks[PoseLandmark.LEFT_ELBOW].y
                ]
                left_wrist = [
                    landmarks[PoseLandmark.LEFT_WRIST].x,
                    landmarks[PoseLandmark.LEFT_WRIST].y
                ]
                left_hip = [
                    landmarks[PoseLandmark.LEFT_HIP].x,
                    landmarks[PoseLandmark.LEFT_HIP].y
                ]
                left_ankle = [
                    landmarks[PoseLandmark.LEFT_ANKLE].x,
                    landmarks[PoseLandmark.LEFT_ANKLE].y
                ]

                # ========== MATH CALCULATIONS ==========

                # 1. Body Tilt Angle - Check if user is horizontal (in pushup position)
                # Uses shoulder and ankle to determine body tilt relative to floor
                body_tilt_angle = math.degrees(math.atan2(
                    abs(left_shoulder[1] - left_ankle[1]),  # y difference
                    abs(left_shoulder[0] - left_ankle[0])   # x difference
                ))

                # 2. Elbow Angle - For counting reps (Shoulder -> Elbow -> Wrist)
                try:
                    elbow_angle = calculate_angle(left_shoulder, left_elbow, left_wrist)
                except Exception:
                    elbow_angle = 0.0

                # 3. Back Angle - For form check (Shoulder -> Hip -> Ankle)
                try:
                    back_angle = calculate_angle(left_shoulder, left_hip, left_ankle)
                except Exception:
                    back_angle = 0.0

                # ========== STATE MACHINE LOGIC ==========
                feedback = ""

                # GATE 1: Entry State Check - Is user in horizontal pushup position?
                if body_tilt_angle > 35:
                    # User is standing, sitting, or not in pushup position
                    feedback = "Get into position"

                # GATE 2: Form Check - Is back straight?
                elif back_angle < 165 or back_angle > 195:
                    # Back is not straight (sagging or piking)
                    feedback = "Fix your back"

                # GATE 3: Rep Counter - User is in position AND form is perfect
                else:
                    # Track the pushup movement using elbow angle
                    if elbow_angle < 90:
                        # User is in the "down" position of pushup
                        stage = "down"
                        feedback = "Good form"

                    if elbow_angle > 160 and stage == "down":
                        # User has pushed back up - count the rep!
                        stage = "up"
                        rep_count += 1
                        feedback = str(rep_count)  # Send the count as feedback

                    # If just holding good form without completing a rep
                    if not feedback:
                        feedback = "Good form"

                # Send response back to client
                await websocket.send_text(json.dumps({
                    "status": "success",
                    "feedback": feedback,
                    "count": rep_count,
                    "elbow_angle": round(elbow_angle, 1),
                    "back_angle": round(back_angle, 1)
                }))

                # Debug: Print every 10th frame
                if frame_count % 10 == 0:
                    print(f"[Frame {frame_count}] feedback={feedback}, reps={rep_count}")

            except WebSocketDisconnect:
                # Client disconnected - break out of the loop
                raise
            except Exception as e:
                # Frame processing error - log and continue (don't crash the server)
                print(f"[WebSocket] Frame {frame_count} error: {type(e).__name__}: {e}")
                # Don't print full traceback for every frame - too verbose
                continue

    except WebSocketDisconnect:
        print(f"[WebSocket] Client disconnected after {frame_count} frames")
    except Exception as e:
        print(f"[WebSocket] Connection error after {frame_count} frames: {e}")
        traceback.print_exc()


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


@app.post("/api/auth/request-otp", response_model=schemas.OTPResponse)
def request_otp(req: schemas.OTPRequest, db: Session = Depends(get_db)):
    """Request OTP for phone-based authentication (mock implementation)."""
    # Generate a mock OTP (in production, integrate with SMS provider)
    otp = str(random.randint(1000, 9999))
    # In production, store OTP in cache (Redis) with expiration
    return {"message": f"OTP sent to {req.phone}", "otp": otp}


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
