import os
import json
import logging
import requests
from pathlib import Path
from openai import AzureOpenAI
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are FitCare AI Trainer — a professional fitness coach and sports nutritionist.
You give precise, motivating advice on workouts, recovery, and nutrition.
Always tailor your advice to the user's stated fitness goal: lose weight, gain muscle, or maintain.
When asked for structured data, output ONLY valid JSON.
Keep responses concise, action-oriented, and encouraging."""

try:
    client = AzureOpenAI(
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_key=os.getenv("AZURE_OPENAI_KEY"),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
    )
    DEPLOYMENT_NAME = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")
except Exception as e:
    logger.error(f"Azure Client Init Failed: {e}")
    client = None


def get_fitness_advice(user_message: str, user_goal: str = "maintain") -> str:
    """
    Sends a message to the AI Trainer and returns a plain-text reply.
    Falls back gracefully if Azure OpenAI is not configured.
    """
    if not client:
        return get_fallback_response(user_message)

    try:
        response = client.chat.completions.create(
            model=DEPLOYMENT_NAME,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"[User Goal: {user_goal}] {user_message}"}
            ],
            temperature=0.7,
            max_tokens=400
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"AI Trainer chat failed: {e}")
        return get_fallback_response(user_message)


def get_workout_plan_json(user_goal: str, activity_level: str, duration_minutes: int = 45) -> dict:
    """
    Asks the AI Trainer to generate a structured workout plan as JSON.
    """
    if not client:
        return get_fallback_workout()

    prompt = f"""
    Generate a {duration_minutes}-minute workout plan.
    - Goal: {user_goal}
    - Fitness level: {activity_level}

    RETURN JSON EXACTLY LIKE THIS:
    {{
        "plan_title": "...",
        "warm_up": ["Exercise 1 - 5 min", "Exercise 2 - 3 min"],
        "main_workout": [
            {{"exercise": "Push-ups", "sets": 3, "reps": "12", "rest_seconds": 60}},
            {{"exercise": "Squats", "sets": 4, "reps": "15", "rest_seconds": 45}}
        ],
        "cool_down": ["Stretch 1 - 3 min", "Stretch 2 - 2 min"],
        "estimated_calories": 250,
        "trainer_tip": "..."
    }}
    """
    try:
        response = client.chat.completions.create(
            model=DEPLOYMENT_NAME,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=0.6,
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.error(f"Workout plan generation failed: {e}")
        return get_fallback_workout()


def get_fallback_response(message: str) -> str:
    return (
        "Your AI Trainer is offline right now, but here's a universal tip: "
        "Stay consistent, prioritise sleep, and drink enough water. "
        "You've got this! 💪"
    )


def get_fallback_workout() -> dict:
    return {
        "plan_title": "Basic Bodyweight Circuit (AI Offline)",
        "warm_up": ["Jumping Jacks - 2 min", "Arm Circles - 1 min"],
        "main_workout": [
            {"exercise": "Push-ups", "sets": 3, "reps": "10", "rest_seconds": 60},
            {"exercise": "Squats", "sets": 3, "reps": "15", "rest_seconds": 60},
            {"exercise": "Plank", "sets": 3, "reps": "30 sec hold", "rest_seconds": 45}
        ],
        "cool_down": ["Standing quad stretch - 30 sec each leg", "Shoulder cross-body stretch - 30 sec each"],
        "estimated_calories": 180,
        "trainer_tip": "Focus on form over speed."
    }

def generate_meal_plan_ollama(user_goal: str, calories: float, protein: float, carbs: float, fats: float) -> str:
    """
    Calls the local Ollama API (phi3) to generate a personalised 1-day meal plan based on calculated macros.
    """
    OLLAMA_URL = "http://localhost:11434/api/generate"
    
    prompt = f"""
    Create a practical, high-quality 1-day sample meal plan (Breakfast, Lunch, Dinner, Snack).
    Goal: {user_goal}
    Target Daily Calories: {int(calories)} kcal
    Macros: {int(protein)}g Protein, {int(carbs)}g Carbs, {int(fats)}g Fat

    Keep it concise, realistic, and formatted nicely. Do not use generic placeholders.
    """
    
    payload = {
        "model": "phi3",
        "prompt": prompt,
        "stream": False,
        "system": "You are a professional sports nutritionist providing straightforward, practical meal plans."
    }

    try:
        logger.info(f"Sending meal plan request to Ollama phi3...")
        response = requests.post(OLLAMA_URL, json=payload, timeout=20)
        
        if response.status_code == 200:
            data = response.json()
            return data.get("response", "").strip()
        else:
            logger.error(f"Ollama Error [{response.status_code}]: {response.text}")
            return get_fallback_meal_plan(calories, protein, carbs, fats)
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Ollama Connection Failed: {e}. Is Ollama running?")
        return get_fallback_meal_plan(calories, protein, carbs, fats)

def get_fallback_meal_plan(cal: float, p: float, c: float, f: float) -> str:
    return (
        f"🤖 AI Offline — Generic Plan Example\n\n"
        f"**Goal**: {int(cal)} kcal | {int(p)}g Protein | {int(c)}g Carbs | {int(f)}g Fat\n\n"
        f"• Breakfast: Oatmeal with whey protein and berries\n"
        f"• Lunch: Grilled chicken breast, sweet potato, and broccoli\n"
        f"• Dinner: Baked salmon with quinoa and asparagus\n"
        f"• Snack: Greek yogurt with a handful of almonds\n\n"
        f"(Make sure Ollama is running locally for personalised AI generation!)"
    )
