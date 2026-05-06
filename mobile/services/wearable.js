import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { fitcareAPI } from './api';

// ================================================================
//  BLE MANAGER — Singleton (one per app lifecycle)
// ================================================================
const manager = new BleManager();

// Heart Rate Service UUID (Bluetooth SIG standard 0x180D)
const HR_SERVICE_UUID        = '180d';
const HR_CHARACTERISTIC_UUID = '2a37'; // Heart Rate Measurement

let connectedDevice = null;
let hrSubscription  = null;

// ================================================================
//  HEALTH CONNECT (Passive / Background Sync)
//  Reads historical data written by the OS or other watch apps.
// ================================================================

/**
 * Initializes Health Connect, checks availability, and requests
 * the permissions needed for the Bio-Replenishment Protocol.
 *
 * Safe to call inside a Development Build and on real devices.
 * On Expo Go or unsupported devices it silently returns false.
 *
 * @returns {Promise<boolean>} true if initialized + permissions granted.
 */
export const initializeWearable = async () => {
    try {
        const { HealthConnect } = require('react-native-health-connect');
        const isAvailable = await HealthConnect.isAvailable();
        if (!isAvailable) {
            console.log('[HealthConnect] Not available on this device');
            return false;
        }

        await HealthConnect.initialize();

        // Permissions required for the Bio-Replenishment Protocol
        const permissions = [
            { accessType: 'read', recordType: 'HeartRate' },
            { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
        ];

        const grantedPermissions = await HealthConnect.requestPermission(permissions);
        const granted = grantedPermissions.length > 0;
        console.log(`[HealthConnect] Initialized. Permissions granted: ${granted}`);
        return granted;
    } catch (error) {
        console.log('[HealthConnect] Initialization failed:', error.message);
        return false;
    }
};

// ================================================================
//  BLE REAL-TIME STREAMING (Active Sync)
//  Connects directly to the watch for live BPM during exercise.
// ================================================================

/**
 * Scans for the standard Heart Rate BLE service (0x180D), connects
 * to the first device found, and begins streaming decoded BPM values.
 *
 * Packet format (Bluetooth SIG GATT spec):
 *   Byte 0: Flags (bit 0 = 0 means 8-bit BPM format)
 *   Byte 1: Heart Rate Value (BPM) — 8-bit
 *
 * @param {(bpm: number) => void} onDataReceived  Callback invoked on every BPM update.
 * @param {(err: string) => void} [onError]       Optional error callback.
 */
export const startLiveHeartRate = (onDataReceived, onError) => {
    console.log('[BLE] Scanning for 0x180D (Heart Rate Service)...');

    manager.startDeviceScan([HR_SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
        if (error) {
            const msg = `[BLE] Scan Error: ${error.message}`;
            console.log(msg);
            onError?.(msg);
            return;
        }

        if (device) {
            console.log('[BLE] Device Found:', device.name || 'Unknown Watch', `(${device.id})`);
            manager.stopDeviceScan();

            device
                .connect({ timeout: 10000 })
                .then((d) => d.discoverAllServicesAndCharacteristics())
                .then((d) => {
                    connectedDevice = d;
                    console.log('[BLE] Connected. Subscribing to 0x2A37 (Heart Rate Measurement)...');

                    hrSubscription = d.monitorCharacteristicForService(
                        HR_SERVICE_UUID,
                        HR_CHARACTERISTIC_UUID,
                        (err, characteristic) => {
                            if (err) {
                                const msg = `[BLE] Monitor Error: ${err.message}`;
                                console.log(msg);
                                onError?.(msg);
                                return;
                            }

                            if (!characteristic?.value) return;

                            // Decode Base64 → raw bytes → BPM
                            const raw = Buffer.from(characteristic.value, 'base64');
                            const flags = raw.readUInt8(0);
                            // Bit 0 of Flags: 0 = 8-bit BPM, 1 = 16-bit BPM
                            const bpm = (flags & 0x01) === 0
                                ? raw.readUInt8(1)
                                : raw.readUInt16LE(1);

                            console.log(`[BLE] ❤ ${bpm} BPM`);
                            onDataReceived(bpm);
                        }
                    );
                })
                .catch((err) => {
                    const msg = `[BLE] Connection Failed: ${err.message}`;
                    console.log(msg);
                    onError?.(msg);
                });
        }
    });
};

/**
 * Cleanly disconnects from the BLE device and stops HR monitoring.
 */
export const stopLiveHeartRate = () => {
    if (hrSubscription) {
        hrSubscription.remove();
        hrSubscription = null;
    }

    if (connectedDevice) {
        connectedDevice
            .cancelConnection()
            .then(() => {
                connectedDevice = null;
                console.log('[BLE] Connection Terminated Safely');
            })
            .catch((err) => console.log('[BLE] Disconnect Error:', err.message));
    }
};

// ================================================================
//  HISTORICAL DATA FETCH (Health Connect)
//  Used for post-workout calorie and HR stats.
// ================================================================

/**
 * Fetches all Heart Rate samples from Health Connect within the
 * given time window and returns the average BPM.
 *
 * @param {string} startTime  ISO 8601 timestamp
 * @param {string} endTime    ISO 8601 timestamp
 * @returns {Promise<number|null>} Average BPM rounded to integer, or null on failure.
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

        const allSamples = records.flatMap((record) => record.samples);
        if (allSamples.length === 0) return null;

        const sum = allSamples.reduce((acc, s) => acc + s.beatsPerMinute, 0);
        return Math.round(sum / allSamples.length);
    } catch (error) {
        console.log('[HealthConnect] Read Error:', error.message);
        return null;
    }
};

/**
 * Fetches total active calories burned from Health Connect within
 * the given time window.
 *
 * @param {string} startTime  ISO 8601 timestamp
 * @param {string} endTime    ISO 8601 timestamp
 * @returns {Promise<number|null>} Total kcal (rounded), or null on failure.
 */
export const fetchActiveCalories = async (startTime, endTime) => {
    try {
        const { HealthConnect } = require('react-native-health-connect');
        const records = await HealthConnect.readRecords('ActiveCaloriesBurned', {
            timeRangeFilter: {
                operator: 'between',
                startTime,
                endTime,
            },
        });

        if (!records || records.length === 0) return null;

        const total = records.reduce((acc, r) => acc + (r.energy?.inKilocalories ?? 0), 0);
        return Math.round(total);
    } catch (error) {
        console.log('[HealthConnect] Calorie Read Error:', error.message);
        return null;
    }
};

// ================================================================
//  UNIFIED WORKOUT LOGGING
//  Accepts "Fusion Data": Reps + Form Quality + Watch Calories
// ================================================================

/**
 * Sends the completed workout's fusion data to the backend.
 *
 * @param {object} workoutData
 * @param {number}  workoutData.userId
 * @param {string}  workoutData.type            e.g. 'pushup'
 * @param {number}  workoutData.duration         minutes
 * @param {string}  [workoutData.exerciseCategory] e.g. 'Strength'
 * @param {string}  [workoutData.exerciseName]
 * @param {number}  [workoutData.avgHR]          average BPM from BLE stream
 * @param {number}  [workoutData.maxHR]          peak BPM
 * @param {number}  [workoutData.totalReps]      reps counted by the Vision Engine
 * @param {number}  [workoutData.avgPrecision]   form quality 0-100
 * @param {number}  [workoutData.watchCalories]  actual kcal from Health Connect
 */
export const sendWorkoutToBackend = async (workoutData) => {
    if (!workoutData.userId || !workoutData.duration) {
        console.error('[Sync] Incomplete workout data packet — userId and duration required');
        return;
    }

    return await fitcareAPI.logWorkout({
        user_id:           workoutData.userId,
        exercise_type:     workoutData.type,
        duration_minutes:  workoutData.duration,
        exercise_category: workoutData.exerciseCategory,
        exercise_name:     workoutData.exerciseName,
        avg_heart_rate:    workoutData.avgHR       ?? 0,
        heart_rate_max:    workoutData.maxHR       ?? 0,
        total_reps:        workoutData.totalReps   ?? 0,
        avg_precision:     workoutData.avgPrecision ?? 0,
        watch_calories:    workoutData.watchCalories ?? null,
    });
};