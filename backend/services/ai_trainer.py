import os
import json
import logging
import requests
from pathlib import Path
from dotenv import load_dotenv
import re

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_CHAT_URL = f"{OLLAMA_BASE_URL}/api/generate"

CHAT_SYSTEM_PROMPT = """You are FitCare AI Trainer, a professional but friendly fitness coach and sports nutritionist.
STRICT RULES:
1. ONLY answer questions about workouts, diet, and fitness.
2. If asked about anything else, reply: "I'm your FitCare AI Coach! I can only help with diet, nutrition, and workout questions."
3. Provide DETAILED, thorough answers, but explain things in VERY SIMPLE WORDS. Do not use overly complex medical or scientific jargon without explaining it simply.
4. Always tailor your advice specifically to the user's personal body metrics (height, weight, age, etc.) and fitness goal. Mention their specific context if relevant to the answer.
5. Use bullet points or numbered lists to make your detailed advice easy to read. Be encouraging and motivating!"""

JSON_SYSTEM_PROMPT = """You are FitCare AI Trainer. You output ONLY valid JSON.
Do not wrap your response in markdown blocks. Do not include introductory text.
Output raw JSON only."""

def get_fitness_advice(user_message: str, user_context: dict = None) -> str:
    """
    Sends a message to the local Ollama AI Trainer (Phi-3).
    """
    if user_context is None:
        user_context = {"goal": "maintain"}
        
    context_str = (
        f"User Profile:\n"
        f"- Goal: {user_context.get('goal')}\n"
        f"- Age: {user_context.get('age')}\n"
        f"- Gender: {user_context.get('gender')}\n"
        f"- Weight: {user_context.get('weight')} kg\n"
        f"- Height: {user_context.get('height')} cm\n"
        f"- Activity Level: {user_context.get('activity_level')}"
    )
    
    prompt = f"{context_str}\n\nUser Question: {user_message}"
    
    payload = {
        "model": "phi3",
        "prompt": prompt,
        "stream": False,
        "system": CHAT_SYSTEM_PROMPT
    }
    
    try:
        logger.info("Sending chat to local Ollama phi3...")
        response = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=60)
        if response.status_code == 200:
            return response.json().get("response", "").strip()
        else:
            logger.error(f"Ollama chat error [{response.status_code}]: {response.text}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Ollama chat connection failed: {e}")
        
    return get_fallback_response(user_message)


def get_workout_plan_json(user_goal: str, activity_level: str, duration_minutes: int = 45) -> dict:
    """
    Asks the local Ollama AI Trainer (Phi-3) to generate a structured workout plan as JSON.
    """
    prompt = f"""
Generate a {duration_minutes}-minute workout plan for a {activity_level} user with the goal to {user_goal}.
Respond with ONLY a raw JSON object matching this exact structure:
{{
  "plan_title": "A short, motivating title",
  "warm_up": ["Exercise 1 - 5 min", "Exercise 2 - 3 min"],
  "main_workout": [
    {{"exercise": "Push-ups", "sets": 3, "reps": "12", "rest_seconds": 60}},
    {{"exercise": "Squats", "sets": 4, "reps": "15", "rest_seconds": 45}}
  ],
  "cool_down": ["Stretch 1 - 3 min", "Stretch 2 - 2 min"],
  "estimated_calories": 250,
  "trainer_tip": "A short motivating tip"
}}
"""
    
    payload = {
        "model": "phi3",
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "system": JSON_SYSTEM_PROMPT
    }
    
    try:
        logger.info("Sending JSON workout request to local Ollama phi3...")
        response = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=120)
        if response.status_code == 200:
            raw_response = response.json().get("response", "").strip()
            # Clean up potential markdown formatting that Phi-3 might still include
            raw_response = re.sub(r'```json\s*', '', raw_response)
            raw_response = re.sub(r'```\s*', '', raw_response)
            return json.loads(raw_response)
        else:
            logger.error(f"Ollama JSON error [{response.status_code}]: {response.text}")
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON from Ollama: {e} - Raw Output: {raw_response}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Ollama JSON connection failed: {e}")
        
    return get_fallback_workout()


def generate_meal_plan_ollama(user_goal: str, calories: float, protein: float, carbs: float, fats: float) -> str:
    """
    Calls the local Ollama API (phi3) to generate a personalised 1-day meal plan based on calculated macros.
    """
    prompt = f"""
Goal: {user_goal}
Target: {int(calories)} kcal
Macros: {int(protein)}g Protein, {int(carbs)}g Carbs, {int(fats)}g Fat

Provide a 1-day meal plan with:
- Breakfast
- Lunch
- Dinner
- Snack

Keep it extremely concise and realistic. Do not use generic placeholders.
"""
    
    payload = {
        "model": "phi3",
        "prompt": prompt,
        "stream": False,
        "system": "You are a professional sports nutritionist. Provide straightforward, practical meal plans very concisely."
    }

    try:
        logger.info("Sending meal plan request to local Ollama phi3...")
        response = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=120)
        
        if response.status_code == 200:
            return response.json().get("response", "").strip()
        else:
            logger.error(f"Ollama Error [{response.status_code}]: {response.text}")
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Ollama Connection Failed: {e}. Is Ollama running?")
        
    return get_fallback_meal_plan(calories, protein, carbs, fats)


def analyze_form_flags(exercise_type: str, form_flags: list[str]) -> str:
    """
    Evaluates form flags from BlazePose and uses Ollama to provide encouraging, actionable advice.
    """
    if not form_flags:
        return f"Great job on those {exercise_type}s! Your form looked solid."

    flags_str = ", ".join(form_flags)
    prompt = f"""
The user just completed a set of {exercise_type}s. 
The AI vision system detected the following form issues: {flags_str}

Provide a very short, encouraging 2-sentence feedback telling them how to fix this for their next set.
Do not use markdown formatting.
    """
    
    payload = {
        "model": "phi3",
        "prompt": prompt,
        "stream": False,
        "system": CHAT_SYSTEM_PROMPT
    }
    
    try:
        logger.info(f"Sending form analysis request to local Ollama phi3 for {exercise_type}...")
        response = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=60)
        if response.status_code == 200:
            return response.json().get("response", "").strip()
        else:
            logger.error(f"Ollama form analysis error [{response.status_code}]: {response.text}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Ollama form analysis connection failed: {e}")
        
    return f"We noticed some issues with your {exercise_type} form (e.g. {flags_str}). Try focusing on keeping your core engaged!"


def get_fallback_response(message: str) -> str:
    return (
        "Your AI Trainer is offline right now, but here's a universal tip:\n\n"
        "• Stay consistent with your workouts\n"
        "• Prioritise 7-8 hours of sleep\n"
        "• Drink at least 3L of water daily\n"
        "• You've got this! 💪\n\n"
        "(Make sure Ollama is running locally for personalised AI generation!)"
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
        "trainer_tip": "Focus on form over speed. (Ensure Ollama is running for custom workouts!)"
    }

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
