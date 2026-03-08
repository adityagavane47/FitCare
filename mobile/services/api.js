const BASE_URL = 'http://192.168.1.7:8000';

async function request(path, options = {}) {
    const url = `${BASE_URL}${path}`;
    const config = {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    };
    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }
    const response = await fetch(url, config);
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.detail || `Request failed: ${response.status}`);
    }
    return data;
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

    // --- AI TRAINER ---
    chatWithTrainer: (userId, message) =>
        request('/api/trainer/chat', { method: 'POST', body: { user_id: userId, message } }),

    getTrainerStatus: () =>
        request('/api/trainer/status'),

    // --- WORKOUT ANALYSIS ---
    analyzeWorkoutForm: (userId, exerciseType, formFlags) =>
        request('/api/workout/analysis', { method: 'POST', body: { user_id: userId, exercise_type: exerciseType, form_flags: formFlags } }),
};
