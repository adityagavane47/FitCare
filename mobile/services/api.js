import { Platform } from 'react-native';
import Constants from 'expo-constants';

const API_PORT = '8000';


const API_HOST = '192.168.68.100';
const API_BASE_URL = `http://${API_HOST}:${API_PORT}`;

function getExpoHostCandidate() {
    const hostUri =
        Constants?.expoConfig?.hostUri ||
        Constants?.manifest2?.extra?.expoClient?.hostUri ||
        Constants?.manifest?.debuggerHost;

    if (!hostUri) {
        return null;
    }

    const host = hostUri.split(':')[0];
    return host ? `http://${host}:${API_PORT}` : null;
}

function buildBaseUrlCandidates() {
    const fromEnv = process.env.EXPO_PUBLIC_API_URL;
    const expoHost = getExpoHostCandidate();
    const emulatorHost = Platform.OS === 'android' ? `http://10.0.2.2:${API_PORT}` : null;


    return [
        API_BASE_URL,
        fromEnv,
        expoHost,
        emulatorHost,
        `http://127.0.0.1:${API_PORT}`,
        `http://localhost:${API_PORT}`,
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);
}

const BASE_URL_CANDIDATES = buildBaseUrlCandidates();

async function request(path, options = {}) {
    const config = {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    };

    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }

    let lastError = null;

    for (const baseUrl of BASE_URL_CANDIDATES) {
        try {
            const response = await fetch(`${baseUrl}${path}`, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || `Request failed: ${response.status}`);
            }

            return data;
        } catch (error) {
            // Continue trying candidate URLs only for network-level failures.
            if (error?.message?.includes('Network request failed') || error?.name === 'TypeError') {
                lastError = error;
                continue;
            }
            throw error;
        }
    }

    const attemptedUrls = BASE_URL_CANDIDATES.join(', ');
    throw new Error(`Could not connect to backend. Tried: ${attemptedUrls}. Last error: ${lastError?.message || 'Unknown error'}`);
}

export function getWebSocketUrl(path) {
    const httpUrl = getExpoHostCandidate() || API_BASE_URL;
    const wsUrl = httpUrl.replace(/^http/, 'ws');
    return `${wsUrl}${path}`;
}

export const fitcareAPI = {
    // --- AUTH ---
    requestOTP: (phone) =>
        request('/api/auth/request-otp', { method: 'POST', body: { phone } }),

    verifyOTP: (phone, otp) =>
        request('/api/auth/verify-otp', { method: 'POST', body: { phone, otp } }),

    // --- USER ---
    onboardUser: (userData) =>
        request('/api/users/onboard', { method: 'POST', body: userData }),

    getUser: (userId) =>
        request(`/api/users/${userId}`),

    updateUser: (userId, updates) =>
        request(`/api/users/${userId}`, { method: 'PUT', body: updates }),

    // --- WORKOUT ---
    logWorkout: (logData) =>
        request('/api/workout/log', { method: 'POST', body: logData }),

    getWorkoutHistory: (userId) =>
        request(`/api/workout/history/${userId}`),

    // --- NUTRITION ---
    generateNutritionPlan: (userId) =>
        request('/api/nutrition/generate', { method: 'POST', body: { user_id: userId } }),

    getNutritionPlan: (userId) =>
        request(`/api/nutrition/plan/${userId}`),

    // --- FOOD SEARCH & LOGGING ---
    searchFood: (query, usdaKey = null) => {
        let url = `/api/food/search?query=${encodeURIComponent(query)}`;
        if (usdaKey) {
            url += `&usda_key=${encodeURIComponent(usdaKey)}`;
        }
        return request(url);
    },

    logFoodItem: (foodData) =>
        request('/api/food/log', { method: 'POST', body: foodData }),

    fetchTodayNutrition: () =>
        request('/api/nutrition/today'),

    // --- AI DAILY INSIGHTS ---
    getDailyInsights: (userId) =>
        request(`/api/user/${userId}/insights`),

    // --- AI TRAINER ---
    chatWithTrainer: (userId, message) =>
        request('/api/trainer/chat', { method: 'POST', body: { user_id: userId, message } }),

    getTrainerStatus: () =>
        request('/api/trainer/status'),

    // --- WORKOUT ANALYSIS ---
    analyzeWorkoutForm: (userId, exerciseType, formFlags) =>
        request('/api/workout/analysis', { method: 'POST', body: { user_id: userId, exercise_type: exerciseType, form_flags: formFlags } }),

    // --- LSTM FORM ANALYSIS ---
    analyzeFormSequence: (exerciseType, landmarkSequence) =>
        request('/api/form/analyze', { method: 'POST', body: { exercise_type: exerciseType, landmark_sequence: landmarkSequence } }),

    // --- POST-WORKOUT SESSION ANALYSIS ---
    analyzeSession: (sessionData) =>
        request('/api/workout/analyze-session', { method: 'POST', body: sessionData }),
};
