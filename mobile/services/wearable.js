/**
 * Initializes Health Connect, checks availability, and requests permissions.
 * @returns {Promise<boolean>} True if initialized and permissions granted.
 */
export const initializeWearable = async () => {
    try {
        const { HealthConnect } = require('react-native-health-connect');
        const isAvailable = await HealthConnect.isAvailable();
        if (!isAvailable) {
            console.log('Health Connect is not available on this device');
            return false;
        }

        await HealthConnect.initialize();

        const permissions = [
            { accessType: 'read', recordType: 'HeartRate' },
            { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
        ];

        const grantedPermissions = await HealthConnect.requestPermission(permissions);
        return grantedPermissions.length > 0;
    } catch (error) {
        console.log('Wearable initialization failed (This is expected in Expo Go):', error.message);
        return false;
    }
};

/**
 * Fetches heart rate samples between startTime and endTime and returns the average.
 * @param {string} startTime ISO timestamp
 * @param {string} endTime ISO timestamp
 * @returns {Promise<number|null>} Average heart rate or null if failed.
 */
export const fetchWorkoutHeartRateData = async (startTime, endTime) => {
    try {
        const { HealthConnect } = require('react-native-health-connect');
        const records = await HealthConnect.readRecords('HeartRate', {
            timeRangeFilter: {
                operator: 'between',
                startTime,
                endTime,
            },
        });

        if (!records || records.length === 0) return null;

        // HeartRate records often contain multiple samples
        const allSamples = records.flatMap(record => record.samples);
        if (allSamples.length === 0) return null;

        const sum = allSamples.reduce((acc, sample) => acc + sample.beatsPerMinute, 0);
        return Math.round(sum / allSamples.length);
    } catch (error) {
        // Logging only, silent fail for user experience
        return null;
    }
};

/**
 * Legacy support for existing WorkoutScreen.js calls.
 * To be replaced by direct Health Connect calls or updated as needed.
 */
export const connectBluetooth = async () => ({ connected: true });
export const startHeartRateStream = (callback) => { console.log('Legacy stream called'); };
export const stopHeartRateStream = () => { console.log('Legacy stream stopped'); };
export const sendWorkoutToBackend = async (userId, type, duration, avgHR, maxHR, exerciseCategory, exerciseName) => {
    const response = await fetch('http://10.0.2.2:8000/api/workout/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId,
            exercise_type: type,
            duration_minutes: duration,
            avg_heart_rate: avgHR,
            heart_rate_max: maxHR,
            exercise_category: exerciseCategory,
            exercise_name: exerciseName
        }),
    });
    return response.json();
};
