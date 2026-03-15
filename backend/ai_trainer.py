"""
AI Trainer Module - Interfaces with local Ollama (Phi-3) for fitness advice.
"""

import os
import time
import requests

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
MODEL_NAME = os.getenv("OLLAMA_MODEL", "phi3")
OLLAMA_CONNECT_TIMEOUT = float(os.getenv("OLLAMA_CONNECT_TIMEOUT", "5"))
OLLAMA_READ_TIMEOUT = float(os.getenv("OLLAMA_READ_TIMEOUT", "120"))
OLLAMA_RETRIES = int(os.getenv("OLLAMA_RETRIES", "1"))


def _query_ollama(prompt: str) -> str:
    """
    Send a prompt to the local Ollama instance and return the response.
    Falls back to a default message if Ollama is unavailable.
    """
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        # Keep model loaded briefly so repeated calls are less likely to cold-start timeout.
        "keep_alive": "5m",
    }

    attempts = OLLAMA_RETRIES + 1
    for attempt in range(1, attempts + 1):
        try:
            response = requests.post(
                f"{OLLAMA_URL}/api/generate",
                json=payload,
                timeout=(OLLAMA_CONNECT_TIMEOUT, OLLAMA_READ_TIMEOUT)
            )
            if response.status_code == 200:
                return response.json().get("response", "No response generated.")
            print(f"[AI Trainer] Ollama non-200 [{response.status_code}]: {response.text}")
        except requests.exceptions.ReadTimeout as e:
            print(
                f"[AI Trainer] Ollama read timeout (attempt {attempt}/{attempts}, "
                f"read timeout={OLLAMA_READ_TIMEOUT}s): {e}"
            )
            if attempt < attempts:
                time.sleep(1.5)
                continue
        except requests.exceptions.RequestException as e:
            print(f"[AI Trainer] Ollama request error: {e}")
            break

    return "AI trainer is currently offline. Please try again later."


def generate_meal_plan_ollama(user_goal: str, calories: float, protein: float, carbs: float, fats: float) -> str:
    """
    Generate a personalized meal plan using Ollama Phi-3.
    """
    prompt = f"""You are a professional nutritionist. Create a simple one-day meal plan for someone with:
- Goal: {user_goal}
- Daily calories: {calories} kcal
- Protein: {protein}g
- Carbs: {carbs}g
- Fats: {fats}g

Provide breakfast, lunch, dinner, and one snack. Keep it practical and concise."""

    return _query_ollama(prompt)


def get_fitness_advice(message: str, user_context: dict) -> str:
    """
    Get personalized fitness advice from the AI trainer.
    """
    prompt = f"""You are an encouraging fitness coach. The user has the following profile:
- Goal: {user_context.get('goal', 'maintain')}
- Age: {user_context.get('age', 'unknown')}
- Gender: {user_context.get('gender', 'unknown')}
- Weight: {user_context.get('weight', 'unknown')} kg
- Height: {user_context.get('height', 'unknown')} cm
- Activity level: {user_context.get('activity_level', 'unknown')}

User question: {message}

Provide helpful, motivating fitness advice. Keep your response concise (2-3 sentences)."""

    return _query_ollama(prompt)


def analyze_form_flags(exercise_type: str, form_flags: list) -> str:
    """
    Analyze form issues detected by pose estimation and provide coaching feedback.
    """
    if not form_flags:
        return "Great job! Your form looks good. Keep it up!"

    flags_str = ", ".join(form_flags)

    prompt = f"""You are a supportive fitness coach. The user is doing {exercise_type} and the pose detection system flagged these issues: {flags_str}

Provide brief, encouraging feedback (2-3 sentences) on how to fix these issues. Be positive and constructive."""

    return _query_ollama(prompt)
