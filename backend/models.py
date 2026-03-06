from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
import enum


class FitnessGoal(str, enum.Enum):
    lose = "lose"
    gain = "gain"
    maintain = "maintain"


class ActivityLevel(str, enum.Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    other = "other"


class UserDB(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    # --- AUTHENTICATION ---
    email = Column(String, unique=True, index=True, nullable=True)
    phone = Column(String, unique=True, index=True)
    name = Column(String, nullable=True)

    # --- FITNESS PROFILE ---
    age = Column(Integer, nullable=True)
    gender = Column(String, nullable=True)
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)
    fitness_goal = Column(String, default="maintain")
    activity_level = Column(String, default="beginner")

    # --- META ---
    created_at = Column(DateTime, default=datetime.utcnow)

    # --- RELATIONSHIPS ---
    workout_logs = relationship("WorkoutLog", back_populates="user")
    nutrition_plans = relationship("NutritionPlan", back_populates="user")


class WorkoutLog(Base):
    """Stores a single workout session — heart rate + duration — typically sent from a wearable."""
    __tablename__ = "workout_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    exercise_type = Column(String, default="general")
    duration_minutes = Column(Float)
    heart_rate_avg = Column(Integer, nullable=True)
    heart_rate_max = Column(Integer, nullable=True)
    calories_burned = Column(Float, nullable=True)

    logged_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("UserDB", back_populates="workout_logs")


class NutritionPlan(Base):
    """
    A calculated nutrition plan based on the Mifflin-St Jeor equation.
    A new plan is generated each time the user triggers /api/nutrition/generate.
    """
    __tablename__ = "nutrition_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    # Mifflin-St Jeor outputs
    bmr = Column(Float)
    tdee = Column(Float)
    target_calories = Column(Float)

    # Macro breakdown
    protein_g = Column(Float)
    carbs_g = Column(Float)
    fat_g = Column(Float)

    ai_meal_plan = Column(String, nullable=True)

    generated_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("UserDB", back_populates="nutrition_plans")
