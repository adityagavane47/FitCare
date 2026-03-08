from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ===========================
# USER SCHEMAS
# ===========================

class UserCreate(BaseModel):
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    fitness_goal: Optional[str] = "maintain"
    activity_level: Optional[str] = "beginner"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    fitness_goal: Optional[str] = None
    activity_level: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    phone: str
    name: Optional[str]
    email: Optional[str]
    age: Optional[int]
    gender: Optional[str]
    height_cm: Optional[float]
    weight_kg: Optional[float]
    fitness_goal: Optional[str]
    activity_level: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ===========================
# OTP AUTH SCHEMAS
# ===========================

class OTPRequest(BaseModel):
    phone: str = Field(..., description="10-digit Indian mobile number")


class OTPVerify(BaseModel):
    phone: str
    otp: str


class OTPResponse(BaseModel):
    message: str
    otp: str  # Exposed only in dev/mock mode — remove in production


class OTPVerifyResponse(BaseModel):
    user_id: int
    is_new_user: bool
    phone: str
    name: Optional[str] = None


# ===========================
# WORKOUT LOG SCHEMAS
# ===========================

class WorkoutLogCreate(BaseModel):
    user_id: int
    exercise_type: str = "general"
    exercise_category: Optional[str] = None
    exercise_name: Optional[str] = None
    duration_minutes: float
    heart_rate_avg: Optional[int] = None
    heart_rate_max: Optional[int] = None
    avg_heart_rate: Optional[int] = None
    calories_burned: Optional[float] = None
    dynamic_calories: Optional[float] = None


class WorkoutLogResponse(BaseModel):
    id: int
    user_id: int
    exercise_type: str
    exercise_category: Optional[str]
    exercise_name: Optional[str]
    duration_minutes: float
    heart_rate_avg: Optional[int]
    heart_rate_max: Optional[int]
    avg_heart_rate: Optional[int]
    calories_burned: Optional[float]
    dynamic_calories: Optional[float]
    logged_at: datetime

    class Config:
        from_attributes = True


# ===========================
# NUTRITION PLAN SCHEMAS
# ===========================

class NutritionRequest(BaseModel):
    user_id: int


class NutritionPlanResponse(BaseModel):
    id: int
    user_id: int
    bmr: float
    tdee: float
    target_calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    ai_meal_plan: Optional[str] = None
    generated_at: datetime

    class Config:
        from_attributes = True


# ===========================
# AI TRAINER SCHEMAS
# ===========================

class TrainerChatRequest(BaseModel):
    user_id: Optional[int] = None
    message: str


class TrainerChatResponse(BaseModel):
    reply: str


# ===========================
# FORM ANALYSIS SCHEMAS
# ===========================

class WorkoutAnalysisRequest(BaseModel):
    user_id: int
    exercise_type: str
    form_flags: list[str]


class WorkoutAnalysisResponse(BaseModel):
    feedback: str
