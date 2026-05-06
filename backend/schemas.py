from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime






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






class OTPRequest(BaseModel):
    phone: str = Field(..., description="10-digit Indian mobile number")


class OTPVerify(BaseModel):
    phone: str
    otp: str


class OTPResponse(BaseModel):
    message: str


class OTPVerifyResponse(BaseModel):
    user_id: int
    is_new_user: bool
    phone: str
    name: Optional[str] = None






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






class TrainerChatRequest(BaseModel):
    user_id: Optional[int] = None
    message: str


class TrainerChatResponse(BaseModel):
    reply: str






class WorkoutAnalysisRequest(BaseModel):
    user_id: int
    exercise_type: str
    form_flags: list[str]


class WorkoutAnalysisResponse(BaseModel):
    feedback: str






class FormAnalysisRequest(BaseModel):
    """Request payload for TensorFlow LSTM form analysis."""
    exercise_type: str = Field(default="pushup", description="Type of exercise being performed")
    landmark_sequence: list[list[float]] = Field(
        ...,
        description="Sliding window of 30 frames, each frame is 99 floats (33 landmarks × 3 coords X,Y,Z)"
    )


class FormAlertItem(BaseModel):
    label: str
    confidence: float
    message: str


class JointStatusItem(BaseModel):
    joint: str
    status: str
    severity: str
    confidence: float


class FormAnalysisResponse(BaseModel):
    """Response from the LSTM form analysis endpoint."""
    accuracy: float = Field(..., description="Overall form correctness percentage (0-100)")
    labels: dict[str, float] = Field(..., description="Per-label confidence scores")
    alerts: list[FormAlertItem] = Field(default_factory=list, description="Detected form errors")
    joint_status: list[JointStatusItem] = Field(..., description="Terminal-style joint status list")
    exercise_type: str






class SessionAnalysisRequest(BaseModel):
    """Request payload for post-workout session analysis."""
    user_id: int
    exercise_type: str = Field(default="pushup", description="Type of exercise: pushup, squat, etc.")
    total_reps: int = Field(..., description="Total reps completed in the session")
    avg_precision: float = Field(..., description="Average form precision score 0-100")
    form_flags: list[str] = Field(default_factory=list, description="Unique form issues detected during session")
    duration_seconds: int = Field(..., description="Total session duration in seconds")
    landmark_summary: Optional[list[list[float]]] = Field(None, description="Optional batch of landmark frames for deep analysis")


class SessionAnalysisResponse(BaseModel):
    """Response from the post-workout session analysis."""
    summary: str = Field(..., description="AI-generated coaching feedback")
    grade: str = Field(..., description="Session grade: A+, A, B, C, D, F")
    recommendations: list[str] = Field(default_factory=list, description="Specific improvement tips")
