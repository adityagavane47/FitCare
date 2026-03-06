/**
 * wearable.js — FitCare Wearable Bridge Service
 *
 * This service is the integration point for heart rate and activity data.
 * Currently runs in MOCK MODE — replace the stub functions with real
 * Web Bluetooth or Google Fit SDK calls when targeting physical devices.
 *
 * Phase 1: Mock data  ✅
 * Phase 2: Web Bluetooth (Chrome/Android) — TODO
 * Phase 3: Google Fit REST API — TODO
 */

import { fitcareAPI } from './api';

let _heartRateInterval = null;
let _mockHeartRate = 72;

/**
 * Simulates a Bluetooth device connection.
 * Replace with: navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] })
 */
export async function connectBluetooth() {
    console.log('[Wearable] Connecting to Bluetooth device...');
    await new Promise((res) => setTimeout(res, 1000));
    console.log('[Wearable] Connected (mock).');
    return { deviceName: 'FitCare Band (Mock)', connected: true };
}

/**
 * Starts a Google Fit session.
 * Replace with: OAuth 2.0 flow + Google Fit REST API session start.
 */
export async function startGoogleFitSession() {
    console.log('[Wearable] Starting Google Fit session...');
    return { session_id: `gfit_${Date.now()}`, started: true };
}

/**
 * Simulates a live heart rate stream.
 * Calls `onData` callback every 2 seconds with { heartRate, timestamp }.
 * Replace with: BLE characteristic notifications from the heart_rate service.
 */
export function startHeartRateStream(onData) {
    _heartRateInterval = setInterval(() => {
        // Simulate realistic heart rate fluctuation
        _mockHeartRate += Math.floor((Math.random() - 0.5) * 6);
        _mockHeartRate = Math.max(55, Math.min(185, _mockHeartRate));
        onData({ heartRate: _mockHeartRate, timestamp: new Date().toISOString() });
    }, 2000);
}

/**
 * Stops the heart rate stream.
 */
export function stopHeartRateStream() {
    if (_heartRateInterval) {
        clearInterval(_heartRateInterval);
        _heartRateInterval = null;
    }
}

/**
 * Sends a completed workout session to the backend.
 * This is the primary integration point between the wearable and the API.
 *
 * @param {number} userId
 * @param {string} exerciseType
 * @param {number} durationMinutes
 * @param {number} heartRateAvg
 * @param {number} heartRateMax
 */
export async function sendWorkoutToBackend(
    userId,
    exerciseType,
    durationMinutes,
    heartRateAvg,
    heartRateMax
) {
    const caloriesBurned = Math.round(durationMinutes * (heartRateAvg || 100) * 0.048);

    return fitcareAPI.logWorkout({
        user_id: userId,
        exercise_type: exerciseType,
        duration_minutes: durationMinutes,
        heart_rate_avg: heartRateAvg,
        heart_rate_max: heartRateMax,
        calories_burned: caloriesBurned,
    });
}
