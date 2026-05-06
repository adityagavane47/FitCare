"""
Meal Evaluator — AI-powered meal analysis against user fitness goals.

Uses local Ollama (Phi-3) when available, otherwise returns a smart
template-based evaluation using macro heuristics.

This module is designed to be pluggable: swap the Ollama call for
OpenAI / Gemini later by changing the `_query_llm` internals.
"""

import os
import logging
import requests
import re
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_GENERATE_URL = f"{OLLAMA_BASE_URL}/api/generate"

EVAL_SYSTEM_PROMPT = (
    "You are FitCare AI Nutritionist, embedded in a cyberpunk fitness terminal. "
    "You evaluate meals against a user's fitness goal. "
    "Respond in 2-3 SHORT sentences. Use a direct, slightly robotic tone. "
    "Mention the food name, calorie count, and how the macros align with the goal. "
    "Do NOT use markdown formatting."
)


def evaluate_meal(food_name: str, macros: dict, user_goal: str = "Muscle Hypertrophy") -> str:
    """
    Evaluate a logged meal against the user's fitness goal.

    Args:
        food_name: Name of the food item (e.g. "Grilled Chicken Breast").
        macros:    Dict with keys: calories, protein, carbs, fats (all numeric).
        user_goal: The user's current fitness objective.

    Returns:
        A short, personalised AI feedback string.
    """
    calories = macros.get("calories", 0)
    protein = macros.get("protein", 0)
    carbs = macros.get("carbs", 0)
    fats = macros.get("fats", 0)

    prompt = (
        f"The user just logged: {food_name}\n"
        f"Macros: {int(calories)} kcal, {int(protein)}g protein, "
        f"{int(carbs)}g carbs, {int(fats)}g fat.\n"
        f"User Goal: {user_goal}\n\n"
        f"Evaluate this meal. Is it good or bad for their goal? "
        f"Give a 2-3 sentence analysis."
    )

    payload = {
        "model": "phi3",
        "prompt": prompt,
        "stream": False,
        "system": EVAL_SYSTEM_PROMPT,
    }

    try:
        logger.info(f"[MealEval] Sending evaluation to Ollama for '{food_name}'...")
        response = requests.post(OLLAMA_GENERATE_URL, json=payload, timeout=60)
        if response.status_code == 200:
            result = response.json().get("response", "").strip()
            if result:
                return result
        else:
            logger.error(f"[MealEval] Ollama error [{response.status_code}]: {response.text}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[MealEval] Ollama connection failed: {e}")

    
    return _fallback_evaluation(food_name, calories, protein, carbs, fats, user_goal)


def _fallback_evaluation(
    food_name: str,
    calories: float,
    protein: float,
    carbs: float,
    fats: float,
    user_goal: str,
) -> str:
    """
    Deterministic fallback when Ollama / external LLM is unavailable.
    Applies basic macro heuristics to produce useful feedback.
    """
    goal_lower = user_goal.lower()
    analysis_parts = [f"LOGGED {int(calories)} kcal of {food_name}."]

    
    if protein >= 25:
        analysis_parts.append(f"High protein ({int(protein)}g) — excellent for muscle repair.")
    elif protein >= 10:
        analysis_parts.append(f"Moderate protein ({int(protein)}g) — acceptable intake.")
    else:
        analysis_parts.append(f"Low protein ({int(protein)}g) — consider adding a protein source.")

    
    if "hypertrophy" in goal_lower or "muscle" in goal_lower or "gain" in goal_lower:
        if protein >= 20 and calories >= 300:
            analysis_parts.append("Aligns well with your muscle-building objective. Keep fuelling.")
        elif protein < 15:
            analysis_parts.append("Your hypertrophy goal demands more protein. Pair this with lean meat or whey.")
        else:
            analysis_parts.append("Decent, but aim for 30g+ protein per meal for optimal hypertrophy.")
    elif "lose" in goal_lower or "cut" in goal_lower or "fat loss" in goal_lower:
        if calories > 600:
            analysis_parts.append("Calorie-dense — be mindful of your daily budget on a cut.")
        else:
            analysis_parts.append("Moderate calories — fits a caloric deficit plan.")
    else:
        analysis_parts.append(f"Solid entry for your '{user_goal}' goal. Stay consistent.")

    return " ".join(analysis_parts)
