import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    Dimensions,
    TouchableOpacity,
    ActivityIndicator,
    Animated,
    ScrollView,
    Platform,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';
import Svg, { Line, Circle, Path, G } from 'react-native-svg';
import * as tf from '@tensorflow/tfjs';
import { cameraWithTensors } from '@tensorflow/tfjs-react-native';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { fitcareAPI } from '../services/api';
import { startLiveHeartRate, stopLiveHeartRate, sendWorkoutToBackend, fetchActiveCalories } from '../services/wearable';

const BACKEND_BASE = 'http://10.20.1.7:8000'; // ← Update to your server IP
const STABILIZATION_DURATION = 1500; // ms the user must hold plank before counting starts
const HR_DANGER_THRESHOLD = 170;    // BPM above this triggers voice warning

const TensorCamera = cameraWithTensors(CameraView);

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ================================================================
//  DESIGN SYSTEM — Dark Academia / Underground Terminal
// ================================================================

const COLORS = {
    bg: '#0A0A0A',
    bgDeep: '#050505',
    surface: 'rgba(10, 10, 10, 0.85)',
    surfaceGlass: 'rgba(15, 15, 15, 0.75)',
    primary: '#39FF14',           // Neon Green — correct
    primaryDim: 'rgba(57, 255, 20, 0.15)',
    primaryGlow: 'rgba(57, 255, 20, 0.4)',
    danger: '#FF3131',            // Neon Red — errors
    dangerDim: 'rgba(255, 49, 49, 0.15)',
    dangerGlow: 'rgba(255, 49, 49, 0.5)',
    warning: '#FFB800',
    warningDim: 'rgba(255, 184, 0, 0.15)',
    white: '#FFFFFF',
    textMuted: '#6d6d80',
    textDim: '#3a3a4a',
    border: 'rgba(57, 255, 20, 0.2)',
    borderDanger: 'rgba(255, 49, 49, 0.3)',
    cyan: '#00F0FF',
    cyanDim: 'rgba(0, 240, 255, 0.2)',
};

const FONTS = {
    mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
};

// ================================================================
//  MOVENET CONFIG — 17 Keypoints, Lightning Model
// ================================================================

// TensorCamera input resolution (MoveNet Lightning expects 192×192)
const INPUT_TENSOR_WIDTH = 192;
const INPUT_TENSOR_HEIGHT = 192;

// MoveNet 17-keypoint indices
const KP = {
    NOSE: 0,
    LEFT_EYE: 1,
    RIGHT_EYE: 2,
    LEFT_EAR: 3,
    RIGHT_EAR: 4,
    LEFT_SHOULDER: 5,
    RIGHT_SHOULDER: 6,
    LEFT_ELBOW: 7,
    RIGHT_ELBOW: 8,
    LEFT_WRIST: 9,
    RIGHT_WRIST: 10,
    LEFT_HIP: 11,
    RIGHT_HIP: 12,
    LEFT_KNEE: 13,
    RIGHT_KNEE: 14,
    LEFT_ANKLE: 15,
    RIGHT_ANKLE: 16,
};

const NUM_KEYPOINTS = 17;
const MIN_KEYPOINT_SCORE = 0.3; // Confidence threshold for drawing/analyzing

// Skeleton connections for MoveNet 17-keypoint model
const SKELETON_CONNECTIONS = [
    // Arms
    [KP.LEFT_SHOULDER, KP.LEFT_ELBOW],
    [KP.LEFT_ELBOW, KP.LEFT_WRIST],
    [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW],
    [KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
    // Shoulders
    [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER],
    // Torso
    [KP.LEFT_SHOULDER, KP.LEFT_HIP],
    [KP.RIGHT_SHOULDER, KP.RIGHT_HIP],
    // Hips
    [KP.LEFT_HIP, KP.RIGHT_HIP],
    // Legs
    [KP.LEFT_HIP, KP.LEFT_KNEE],
    [KP.LEFT_KNEE, KP.LEFT_ANKLE],
    [KP.RIGHT_HIP, KP.RIGHT_KNEE],
    [KP.RIGHT_KNEE, KP.RIGHT_ANKLE],
    // Face (subtle)
    [KP.NOSE, KP.LEFT_EYE],
    [KP.NOSE, KP.RIGHT_EYE],
    [KP.LEFT_EYE, KP.LEFT_EAR],
    [KP.RIGHT_EYE, KP.RIGHT_EAR],
];

// ================================================================
//  ANGLE & REP COUNTING UTILITIES
// ================================================================

/**
 * Calculate angle at point B formed by vectors BA and BC.
 * Returns degrees [0, 360).
 */
function calculateAngle(A, B, C) {
    const radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs(radians * (180 / Math.PI));
    if (angle > 180) angle = 360 - angle;
    return angle;
}

/**
 * Check if a keypoint has sufficient confidence to be used.
 */
function isValid(kp) {
    return kp && kp.score >= MIN_KEYPOINT_SCORE;
}

/**
 * Calculate elbow angle for pushup detection (shoulder → elbow → wrist).
 */
function getElbowAngle(keypoints, side = 'left') {
    const shoulder = keypoints[side === 'left' ? KP.LEFT_SHOULDER : KP.RIGHT_SHOULDER];
    const elbow = keypoints[side === 'left' ? KP.LEFT_ELBOW : KP.RIGHT_ELBOW];
    const wrist = keypoints[side === 'left' ? KP.LEFT_WRIST : KP.RIGHT_WRIST];

    if (!isValid(shoulder) || !isValid(elbow) || !isValid(wrist)) return null;
    return calculateAngle(shoulder, elbow, wrist);
}

/**
 * Calculate knee angle for squat detection (hip → knee → ankle).
 */
function getKneeAngle(keypoints, side = 'left') {
    const hip = keypoints[side === 'left' ? KP.LEFT_HIP : KP.RIGHT_HIP];
    const knee = keypoints[side === 'left' ? KP.LEFT_KNEE : KP.RIGHT_KNEE];
    const ankle = keypoints[side === 'left' ? KP.LEFT_ANKLE : KP.RIGHT_ANKLE];

    if (!isValid(hip) || !isValid(knee) || !isValid(ankle)) return null;
    return calculateAngle(hip, knee, ankle);
}

/**
 * Calculate body alignment angle (shoulder → hip → ankle) for plank/pushup form.
 */
function getBodyAlignmentAngle(keypoints, side = 'left') {
    const shoulder = keypoints[side === 'left' ? KP.LEFT_SHOULDER : KP.RIGHT_SHOULDER];
    const hip = keypoints[side === 'left' ? KP.LEFT_HIP : KP.RIGHT_HIP];
    const ankle = keypoints[side === 'left' ? KP.LEFT_ANKLE : KP.RIGHT_ANKLE];

    if (!isValid(shoulder) || !isValid(hip) || !isValid(ankle)) return null;
    return calculateAngle(shoulder, hip, ankle);
}

// ================================================================
//  FORM HEURISTICS ENGINE
// ================================================================

/**
 * Analyze form from keypoints and return alerts + precision score.
 */
function analyzeForm(keypoints, exerciseType) {
    const alerts = [];
    let deductions = 0;
    const maxDeductions = 4; // Each issue can deduct up to 25%

    if (exerciseType === 'pushup') {
        // 1. Body alignment (shoulder-hip-ankle should be ~170-180°)
        const bodyAngle = getBodyAlignmentAngle(keypoints, 'left') ||
                          getBodyAlignmentAngle(keypoints, 'right');
        if (bodyAngle !== null) {
            if (bodyAngle < 155) {
                alerts.push({ message: 'HIPS :: TOO_HIGH — Lower your hips to plank line', severity: 'critical' });
                deductions += 1;
            } else if (bodyAngle > 195 || bodyAngle < 160) {
                alerts.push({ message: 'HIPS :: SAGGING — Engage core, lift to straight line', severity: 'warning' });
                deductions += 0.7;
            }
        }

        // 2. Elbow flaring — compare elbow X vs shoulder X
        const lShoulder = keypoints[KP.LEFT_SHOULDER];
        const lElbow = keypoints[KP.LEFT_ELBOW];
        const rShoulder = keypoints[KP.RIGHT_SHOULDER];
        const rElbow = keypoints[KP.RIGHT_ELBOW];

        if (isValid(lShoulder) && isValid(lElbow) && isValid(rShoulder) && isValid(rElbow)) {
            const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
            const elbowWidth = Math.abs(rElbow.x - lElbow.x);
            if (elbowWidth > shoulderWidth * 1.5) {
                alerts.push({ message: 'ELBOWS :: FLARING — Tuck elbows closer to torso', severity: 'warning' });
                deductions += 0.7;
            }
        }

        // 3. Depth check — elbow angle should reach below 90° at bottom
        const elbowAngle = getElbowAngle(keypoints, 'left') || getElbowAngle(keypoints, 'right');
        // We only flag this if the user seems to be in the "down" position but not deep enough
        // This is tracked per-frame — the rep counter handles the state machine

    } else if (exerciseType === 'squat') {
        // 1. Knee caving — compare knee X position vs ankle X position
        const lKnee = keypoints[KP.LEFT_KNEE];
        const lAnkle = keypoints[KP.LEFT_ANKLE];
        const rKnee = keypoints[KP.RIGHT_KNEE];
        const rAnkle = keypoints[KP.RIGHT_ANKLE];

        if (isValid(lKnee) && isValid(lAnkle) && isValid(rKnee) && isValid(rAnkle)) {
            const ankleWidth = Math.abs(rAnkle.x - lAnkle.x);
            const kneeWidth = Math.abs(rKnee.x - lKnee.x);
            if (kneeWidth < ankleWidth * 0.7) {
                alerts.push({ message: 'KNEES :: CAVING_IN — Push knees outward over toes', severity: 'critical' });
                deductions += 1;
            }
        }

        // 2. Back rounding — torso lean check (shoulder should not be far forward of hip)
        const shoulder = keypoints[KP.LEFT_SHOULDER];
        const hip = keypoints[KP.LEFT_HIP];
        if (isValid(shoulder) && isValid(hip)) {
            // In a front-facing camera, excessive forward lean means shoulder.y >> hip.y
            // For side view, shoulder.x << hip.x
            const forwardLean = Math.abs(shoulder.x - hip.x);
            const torsoHeight = Math.abs(shoulder.y - hip.y);
            if (forwardLean > torsoHeight * 0.6) {
                alerts.push({ message: 'SPINE :: ROUNDING — Keep chest up, neutral spine', severity: 'warning' });
                deductions += 0.7;
            }
        }

        // 3. Depth — knee angle at bottom of squat
        const kneeAngle = getKneeAngle(keypoints, 'left') || getKneeAngle(keypoints, 'right');
        // Tracked by rep counter state machine
    }

    // Calculate precision score (100% minus deductions, clamped 0-100)
    const precision = Math.max(0, Math.min(100, Math.round(100 - (deductions / maxDeductions) * 100)));

    return { alerts, precision };
}


// ================================================================
//  MAIN COMPONENT
// ================================================================

export default function FormCorrectionScreen({ route, navigation }) {
    const { userId, exerciseType = 'pushup' } = route.params || { userId: 1 };

    // ---- State ----
    const [hasPermission, setHasPermission] = useState(null);
    const [tfReady, setTfReady] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [precision, setPrecision] = useState(100);
    const [alerts, setAlerts] = useState([]);
    const [statusMessage, setStatusMessage] = useState('INITIALIZING_SUBSYSTEMS...');
    const [frameCount, setFrameCount] = useState(0);
    const [hasError, setHasError] = useState(false);
    const [detectedKeypoints, setDetectedKeypoints] = useState(null);
    const [repCount, setRepCount] = useState(0);
    const [latency, setLatency] = useState(0);
    const [loadingProgress, setLoadingProgress] = useState('');

    // ---- BLE Heart Rate State ----
    const [liveBpm, setLiveBpm] = useState(null);
    const [bpmPulse] = useState(new Animated.Value(1));
    const liveBpmRef = useRef(null);
    const hrSamplesRef = useRef([]); // all BPM readings for avg calculation
    const sessionStartTimeRef = useRef(null); // ISO string for Health Connect fetch
    const [exercisePhase, setExercisePhase] = useState('IDLE'); // IDLE | UP | DOWN

    // ---- Position Calibration State ----
    const [positionLocked, setPositionLocked] = useState(false);      // true once 1.5 s hold complete
    const [positionValid, setPositionValid] = useState(false);        // live per-frame gate result
    const [stabilizationProgress, setStabilizationProgress] = useState(0); // 0-1
    const stabilizationAnim = useRef(new Animated.Value(0)).current;
    const positionValidRef = useRef(false);                            // ref mirror for use inside loop
    const positionLockedRef = useRef(false);
    const lockTimerStartRef = useRef(null);                            // when user entered valid position
    const voiceLockedRef = useRef(false);                              // spoken "Position locked" once

    // ---- Refs ----
    const detectorRef = useRef(null);
    const isAnalyzingRef = useRef(false);
    const frameCounterRef = useRef(0);
    const requestRef = useRef(null);

    // Backend-driven rep counting state refs (forwarded each frame)
    const repPhaseRef = useRef('IDLE'); // 'IDLE' | 'UP' | 'DOWN'
    const repCountRef = useRef(0);
    const lowestAngleRef = useRef(180.0); // Track deepest angle sent to backend

    // Voice coaching refs
    const lastSpokenRef = useRef(0);
    const lastSpokenWarningRef = useRef('');

    // Session tracking refs (for post-workout summary)
    const sessionStartRef = useRef(null);
    const formFlagsRef = useRef(new Set()); // Unique form issues detected during session
    const precisionSamplesRef = useRef([]); // Track precision over time

    // Camera view dimensions (for coordinate mapping)
    const cameraViewRef = useRef({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });

    // ---- Animations ----
    const alertPulse = useRef(new Animated.Value(0)).current;
    const scanLineAnim = useRef(new Animated.Value(0)).current;
    const loadingDotAnim = useRef(new Animated.Value(0)).current;
    const calibrationIconScale = useRef(new Animated.Value(1)).current;

    // Animate the calibration icon bounce when position is first locked
    const playLockAnimation = useCallback(() => {
        Animated.sequence([
            Animated.timing(calibrationIconScale, { toValue: 1.4, duration: 150, useNativeDriver: true }),
            Animated.spring(calibrationIconScale, { toValue: 1, friction: 4, useNativeDriver: true }),
        ]).start();
    }, [calibrationIconScale]);

    // ================================================================
    //  INITIALIZATION — TF.js + MoveNet
    // ================================================================

    useEffect(() => {
        let mounted = true;

        async function init() {
            // 1. Request camera permission
            const { status } = await Camera.requestCameraPermissionsAsync();
            if (mounted) setHasPermission(status === 'granted');

            if (status !== 'granted') return;

            // 2. Initialize TensorFlow.js
            if (mounted) {
                setStatusMessage('LOADING_NEURAL_ENGINE...');
                setLoadingProgress('Initializing TensorFlow runtime...');
            }

            try {
                await tf.ready();
                if (mounted) setLoadingProgress('TF.js backend active: ' + tf.getBackend());

                // 3. Create MoveNet detector (SinglePose Lightning — fastest)
                if (mounted) setLoadingProgress('Downloading MoveNet Lightning model...');

                const detector = await poseDetection.createDetector(
                    poseDetection.SupportedModels.MoveNet,
                    {
                        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
                        enableSmoothing: true,
                    }
                );

                detectorRef.current = detector;

                if (mounted) {
                    setTfReady(true);
                    setStatusMessage('SUBSYSTEMS_ONLINE — Ready to analyze.');
                    setLoadingProgress('');
                }
            } catch (err) {
                console.error('[TFJS] Init Error:', err);
                if (mounted) {
                    setStatusMessage('NEURAL_ENGINE_FAILURE :: ' + err.message);
                    setHasError(true);
                    setLoadingProgress('');
                }
            }
        }

        init();

        // Start scan line animation
        Animated.loop(
            Animated.timing(scanLineAnim, {
                toValue: 1,
                duration: 3000,
                useNativeDriver: true,
            })
        ).start();

        // Loading dots animation
        Animated.loop(
            Animated.timing(loadingDotAnim, {
                toValue: 3,
                duration: 1500,
                useNativeDriver: false,
            })
        ).start();

        return () => {
            mounted = false;
            stopAnalysis();
            if (detectorRef.current) {
                detectorRef.current.dispose?.();
            }
        };
    }, []);

    // ================================================================
    //  BLE HEART RATE — start/stop with analysis
    // ================================================================

    useEffect(() => {
        if (isAnalyzing) {
            // Pulse animation for BPM card
            Animated.loop(
                Animated.sequence([
                    Animated.timing(bpmPulse, { toValue: 1.25, duration: 400, useNativeDriver: true }),
                    Animated.timing(bpmPulse, { toValue: 1.0,  duration: 400, useNativeDriver: true }),
                ])
            ).start();

            startLiveHeartRate(
                (bpm) => {
                    setLiveBpm(bpm);
                    liveBpmRef.current = bpm;
                    hrSamplesRef.current.push(bpm);
                },
                (err) => console.log('[HR] BLE error:', err)
            );
        } else {
            bpmPulse.stopAnimation();
            bpmPulse.setValue(1);
            stopLiveHeartRate();
        }

        return () => {
            stopLiveHeartRate();
        };
    }, [isAnalyzing]);

    // ================================================================
    //  ALERT PULSE ANIMATION
    // ================================================================

    useEffect(() => {
        if (hasError) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(alertPulse, {
                        toValue: 1,
                        duration: 600,
                        useNativeDriver: true,
                    }),
                    Animated.timing(alertPulse, {
                        toValue: 0.3,
                        duration: 600,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            alertPulse.stopAnimation();
            alertPulse.setValue(0);
        }
    }, [hasError]);

    // ================================================================
    //  REP COUNTING STATE MACHINE
    // ================================================================

    /**
     * Backend-driven rep counter for pushups.
     * Sends keypoints + current state to /api/pushup/analyze every frame.
     * Handles:
     *   - Position gate (is_in_pushup_position)
     *   - 1.5 s stabilization timer before counting starts
     *   - Voice confirmation on first position lock
     *   - REP_COMPLETE events from backend (hysteresis: <70° / >165°)
     */
    const processRepCounting = useCallback(async (keypoints) => {
        if (exerciseType !== 'pushup') {
            // Squat — keep local state machine (unchanged)
            const angle = getKneeAngle(keypoints, 'left') ?? getKneeAngle(keypoints, 'right');
            if (angle === null) return;
            const DOWN_THRESHOLD = 100;
            const UP_THRESHOLD   = 155;
            if (angle < lowestAngleRef.current) lowestAngleRef.current = angle;
            if ((repPhaseRef.current === 'IDLE' || repPhaseRef.current === 'UP') && angle < DOWN_THRESHOLD) {
                repPhaseRef.current = 'DOWN';
                setExercisePhase('DOWN');
                lowestAngleRef.current = angle;
            } else if (repPhaseRef.current === 'DOWN' && angle > UP_THRESHOLD) {
                repPhaseRef.current = 'UP';
                setExercisePhase('UP');
                repCountRef.current += 1;
                setRepCount(repCountRef.current);
                if (lowestAngleRef.current > 110) formFlagsRef.current.add('not_deep_enough');
                lowestAngleRef.current = 180;
            }
            return;
        }

        // Build keypoint payload (normalised 0-1 coords → pass raw pixel coords, backend normalises)
        const kpPayload = keypoints.map(kp => ({ x: kp.x, y: kp.y, score: kp.score ?? 0 }));

        let result;
        try {
            const resp = await fetch(`${BACKEND_BASE}/api/pushup/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keypoints: kpPayload,
                    exercise_type: 'pushup',
                    current_phase: repPhaseRef.current,
                    lowest_angle_this_rep: lowestAngleRef.current,
                }),
            });
            result = await resp.json();
        } catch (e) {
            // Network error — skip this frame
            return;
        }

        const inPosition = result.is_in_pushup_position;

        // --- Update position gate UI ---
        if (inPosition !== positionValidRef.current) {
            positionValidRef.current = inPosition;
            setPositionValid(inPosition);

            if (!inPosition) {
                // Lost position — reset stabilisation
                lockTimerStartRef.current = null;
                setStabilizationProgress(0);
                stabilizationAnim.setValue(0);
                positionLockedRef.current = false;
                setPositionLocked(false);
                voiceLockedRef.current = false;
                setStatusMessage(result.feedback || 'Get into a plank position');
            }
        }

        if (!inPosition) return;

        // --- Stabilisation Timer (1.5 s hold) ---
        if (!positionLockedRef.current) {
            const now = Date.now();
            if (!lockTimerStartRef.current) {
                lockTimerStartRef.current = now;
            }
            const elapsed = now - lockTimerStartRef.current;
            const progress = Math.min(1, elapsed / STABILIZATION_DURATION);
            setStabilizationProgress(progress);
            Animated.timing(stabilizationAnim, {
                toValue: progress,
                duration: 100,
                useNativeDriver: false,
            }).start();

            if (elapsed < STABILIZATION_DURATION) {
                setStatusMessage(`Hold plank... ${Math.ceil((STABILIZATION_DURATION - elapsed) / 1000)}s`);
                return; // Not yet locked — skip rep counting
            }

            // Lock achieved!
            positionLockedRef.current = true;
            setPositionLocked(true);
            playLockAnimation();

            if (!voiceLockedRef.current) {
                voiceLockedRef.current = true;
                Speech.speak('Position locked. Start your set.', { rate: 0.95, pitch: 0.9 });
            }
        }

        // --- Sync state machine from backend response ---
        repPhaseRef.current      = result.new_phase;
        lowestAngleRef.current   = result.new_lowest_angle;
        setExercisePhase(result.new_phase);
        setStatusMessage(result.feedback || 'FORM_NOMINAL');

        if (result.rep_event === 'REP_COMPLETE') {
            repCountRef.current += 1;
            setRepCount(repCountRef.current);
            // Depth check: backend already enforces <70° so if that threshold wasn't met it simply
            // won't send REP_COMPLETE. Log a flag if it was a shallow rep (tracked via new_lowest_angle).
            if (result.new_lowest_angle > 70) {
                formFlagsRef.current.add('not_deep_enough');
            }
        }
    }, [exerciseType, playLockAnimation, stabilizationAnim]);

    // ================================================================
    //  VOICE COACHING ENGINE — 5-second cooldown
    // ================================================================

    const triggerVoiceAlert = useCallback((alertMessage, force = false) => {
        const now = Date.now();
        const cleanText = alertMessage
            .replace(/::/g, '. ')
            .replace(/—/g, ', ')
            .replace(/_/g, ' ');

        // Smart gate: only speak if different warning OR 5+ seconds elapsed
        if (force || cleanText !== lastSpokenWarningRef.current || (now - lastSpokenRef.current > 5000)) {
            Speech.speak(cleanText, {
                rate: 0.85,   // Cybernetic / robotic cadence
                pitch: 0.85,
                language: 'en-US',
            });
            lastSpokenRef.current = now;
            lastSpokenWarningRef.current = cleanText;
        }
    }, []);

    // HR threshold watcher — fires voice alert when BPM exceeds safety limit
    useEffect(() => {
        if (!isAnalyzing || liveBpm === null) return;
        if (liveBpm > HR_DANGER_THRESHOLD) {
            triggerVoiceAlert(
                'Critical Heart Rate Detected. Please Terminate Set.',
                true // force — always speak regardless of cooldown for safety
            );
        }
    }, [liveBpm, isAnalyzing, triggerVoiceAlert]);

    // ================================================================
    //  CAMERA STREAM HANDLER — On-Device Pose Detection Loop
    // ================================================================

    const handleCameraStream = useCallback((images) => {
        const loop = async () => {
            if (!isAnalyzingRef.current || !detectorRef.current) {
                // Keep draining the tensor iterator even when not analyzing
                const next = images.next().value;
                if (next) tf.dispose(next);
                requestRef.current = requestAnimationFrame(loop);
                return;
            }

            const nextImageTensor = images.next().value;
            if (!nextImageTensor) {
                requestRef.current = requestAnimationFrame(loop);
                return;
            }

            try {
                // ---- Measure Latency ----
                const t0 = performance.now();

                // ---- Run MoveNet Inference ----
                const poses = await detectorRef.current.estimatePoses(nextImageTensor, {
                    maxPoses: 1,
                    flipHorizontal: false,
                });

                const inferenceMs = Math.round(performance.now() - t0);
                setLatency(inferenceMs);

                if (poses && poses.length > 0) {
                    const rawKeypoints = poses[0].keypoints;

                    // ---- COORDINATE MAPPING ----
                    // MoveNet returns keypoints with x,y in pixel space of the input tensor
                    // (0..INPUT_TENSOR_WIDTH, 0..INPUT_TENSOR_HEIGHT)
                    // We normalize to [0,1] then multiply by the camera view dimensions
                    const mappedKeypoints = rawKeypoints.map(kp => ({
                        x: (kp.x / INPUT_TENSOR_WIDTH) * cameraViewRef.current.width,
                        y: (kp.y / INPUT_TENSOR_HEIGHT) * cameraViewRef.current.height,
                        score: kp.score,
                        name: kp.name,
                    }));

                    // Update display state
                    setDetectedKeypoints(mappedKeypoints);

                    // ---- Frame counter ----
                    frameCounterRef.current += 1;
                    setFrameCount(frameCounterRef.current);

                    // ---- Rep Counting ----
                    processRepCounting(mappedKeypoints);

                    // ---- Form Analysis (every 3rd frame to save CPU) ----
                    if (frameCounterRef.current % 3 === 0) {
                        const { alerts: formAlerts, precision: formPrecision } = analyzeForm(mappedKeypoints, exerciseType);

                        setPrecision(formPrecision);
                        setAlerts(formAlerts);

                        const hasFormErrors = formAlerts.length > 0;
                        setHasError(hasFormErrors);

                        // Track form flags for session summary
                        formAlerts.forEach(a => {
                            const flagKey = a.message.split('::')[0].trim().toLowerCase().replace(/\s/g, '_');
                            formFlagsRef.current.add(flagKey);
                        });

                        // Track precision samples
                        precisionSamplesRef.current.push(formPrecision);

                        if (hasFormErrors) {
                            const topAlert = formAlerts[0];
                            setStatusMessage(topAlert.message);
                            triggerVoiceAlert(topAlert.message);
                        } else {
                            setStatusMessage('FORM_ANALYSIS :: ALL_NOMINAL');
                        }
                    }
                }
            } catch (err) {
                console.error('[Detector] Error:', err);
            } finally {
                tf.dispose(nextImageTensor);
            }

            requestRef.current = requestAnimationFrame(loop);
        };

        loop();
    }, [exerciseType, processRepCounting, triggerVoiceAlert]);

    // ================================================================
    //  START / STOP CONTROLS
    // ================================================================

    const startAnalysis = useCallback(() => {
        setIsAnalyzing(true);
        isAnalyzingRef.current = true;
        setStatusMessage('Get into a plank position');
        frameCounterRef.current = 0;
        repCountRef.current = 0;
        repPhaseRef.current = 'IDLE';
        lowestAngleRef.current = 180.0;
        setRepCount(0);
        setPrecision(100);
        setAlerts([]);
        setHasError(false);
        setExercisePhase('IDLE');

        // Reset calibration state
        setPositionLocked(false);
        setPositionValid(false);
        setStabilizationProgress(0);
        stabilizationAnim.setValue(0);
        positionValidRef.current   = false;
        positionLockedRef.current  = false;
        lockTimerStartRef.current  = null;
        voiceLockedRef.current     = false;

        // Session tracking
        sessionStartRef.current = Date.now();
        sessionStartTimeRef.current = new Date().toISOString(); // for Health Connect query
        formFlagsRef.current = new Set();
        precisionSamplesRef.current = [];
        hrSamplesRef.current = [];
    }, [stabilizationAnim]);

    const stopAnalysis = useCallback(async () => {
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
            requestRef.current = null;
        }

        const wasAnalyzing = isAnalyzingRef.current;
        setIsAnalyzing(false);
        isAnalyzingRef.current = false;
        setStatusMessage('ANALYSIS_TERMINATED');
        setHasError(false);
        setExercisePhase('IDLE');
        setPositionLocked(false);
        setPositionValid(false);
        setStabilizationProgress(0);
        stabilizationAnim.setValue(0);
        positionValidRef.current  = false;
        positionLockedRef.current = false;
        lockTimerStartRef.current = null;

        // Send fusion data to backend if we had a real session
        if (wasAnalyzing && sessionStartRef.current && repCountRef.current > 0) {
            const sessionEndTime   = new Date().toISOString();
            const sessionStartISO  = sessionStartTimeRef.current;
            const durationSeconds  = Math.round((Date.now() - sessionStartRef.current) / 1000);
            const durationMinutes  = durationSeconds / 60;
            const samples          = precisionSamplesRef.current;
            const avgPrecision     = samples.length > 0
                ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
                : 100;

            // BLE-derived heart rate stats
            const hrSamples = hrSamplesRef.current;
            const avgHR = hrSamples.length > 0
                ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length)
                : 0;
            const maxHR = hrSamples.length > 0 ? Math.max(...hrSamples) : 0;

            try {
                // Fetch actual watch calories from Health Connect (best effort)
                let watchCalories = null;
                if (sessionStartISO) {
                    watchCalories = await fetchActiveCalories(sessionStartISO, sessionEndTime);
                }

                // Send Fusion Data to /api/workout/log
                await sendWorkoutToBackend({
                    userId:           userId || 1,
                    type:             exerciseType,
                    duration:         durationMinutes,
                    exerciseCategory: exerciseType === 'pushup' ? 'Strength' : 'Strength',
                    exerciseName:     exerciseType,
                    avgHR,
                    maxHR,
                    totalReps:        repCountRef.current,
                    avgPrecision,
                    watchCalories,
                });

                // AI session coaching summary
                const sessionData = {
                    user_id:          userId || 1,
                    exercise_type:    exerciseType,
                    total_reps:       repCountRef.current,
                    avg_precision:    avgPrecision,
                    form_flags:       Array.from(formFlagsRef.current),
                    duration_seconds: durationSeconds,
                    avg_heart_rate:   avgHR,
                    watch_calories:   watchCalories,
                };

                const result = await fitcareAPI.analyzeSession(sessionData);
                if (result?.summary) {
                    setStatusMessage('SESSION_COMPLETE :: ' + result.grade);
                    Speech.speak(result.summary, { rate: 0.85, pitch: 0.85 });
                }
            } catch (err) {
                console.warn('[Session] Failed to send summary:', err.message);
                setStatusMessage('SESSION_SAVED_LOCALLY — ' + repCountRef.current + ' reps');
            }
        }
    }, [userId, exerciseType]);

    // ================================================================
    //  RENDER HELPERS
    // ================================================================

    const getAccuracyColor = () => {
        if (precision >= 70) return COLORS.primary;
        if (precision >= 50) return COLORS.warning;
        return COLORS.danger;
    };

    const getLatencyColor = () => {
        if (latency < 50) return COLORS.primary;
        if (latency < 100) return COLORS.warning;
        return COLORS.danger;
    };

    // Scan line translateY interpolation
    const scanLineTranslateY = scanLineAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, SCREEN_HEIGHT],
    });

    // Alert box animated border color
    const alertBorderColor = alertPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [COLORS.borderDanger, COLORS.danger],
    });

    const alertBgColor = alertPulse.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(255, 49, 49, 0.05)', 'rgba(255, 49, 49, 0.2)'],
    });

    // Camera view layout handler — captures actual rendered dimensions for coordinate mapping
    const onCameraLayout = useCallback((event) => {
        const { width, height } = event.nativeEvent.layout;
        cameraViewRef.current = { width, height };
    }, []);

    // ================================================================
    //  RENDER — Loading / Permission States
    // ================================================================

    if (hasPermission === null) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>REQUESTING_BIOMETRIC_ACCESS...</Text>
            </View>
        );
    }

    if (hasPermission === false) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>BIOMETRIC_ERROR :: Camera access denied.</Text>
                <Text style={styles.errorSub}>Grant camera permission in system settings.</Text>
            </View>
        );
    }

    // ---- Model Loading State ----
    if (!tfReady) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <View style={styles.loadingTerminal}>
                        <Text style={styles.loadingTerminalHeader}>{'>'} NEURAL_ENGINE_BOOTSTRAP</Text>
                        <View style={styles.loadingDivider} />

                        <View style={styles.loadingRow}>
                            <Text style={styles.loadingLabel}>STATUS</Text>
                            <Text style={styles.loadingValue}>LOADING</Text>
                        </View>

                        <View style={styles.loadingRow}>
                            <Text style={styles.loadingLabel}>MODEL</Text>
                            <Text style={styles.loadingValue}>MoveNet Lightning</Text>
                        </View>

                        <View style={styles.loadingRow}>
                            <Text style={styles.loadingLabel}>RUNTIME</Text>
                            <Text style={styles.loadingValue}>TensorFlow.js</Text>
                        </View>

                        <View style={styles.loadingDivider} />

                        <Text style={styles.loadingProgressText}>
                            {loadingProgress || 'Initializing...'}
                        </Text>

                        <ActivityIndicator
                            size="large"
                            color={COLORS.primary}
                            style={{ marginTop: 20 }}
                        />

                        <Text style={styles.loadingSubtext}>
                            Preparing on-device inference engine{'\n'}
                            This may take 10-20 seconds on first load
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={styles.loadingBackBtn}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.backText}>← ABORT</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ================================================================
    //  RENDER — Main UI
    // ================================================================

    return (
        <View style={styles.container}>
            {/* ===== CAMERA LAYER ===== */}
            <View style={styles.cameraFrame} onLayout={onCameraLayout}>
                <TensorCamera
                    style={styles.camera}
                    facing="front"
                    onCameraReady={() => console.log('[Camera] Ready')}
                    // Tensor Camera Props — MoveNet Lightning expects 192×192
                    cameraTextureHeight={1200}
                    cameraTextureWidth={1600}
                    resizeHeight={INPUT_TENSOR_HEIGHT}
                    resizeWidth={INPUT_TENSOR_WIDTH}
                    resizeDepth={3}
                    onReady={handleCameraStream}
                    autorender={true}
                />

                {/* Scan Line Animation */}
                {isAnalyzing && (
                    <Animated.View
                        style={[
                            styles.scanLine,
                            { transform: [{ translateY: scanLineTranslateY }] },
                        ]}
                    />
                )}

                {/* ===== SVG SKELETON OVERLAY ===== */}
                <Svg
                    style={styles.skeletonOverlay}
                    width={cameraViewRef.current.width}
                    height={cameraViewRef.current.height}
                >
                    {/* Draw limb connections */}
                    {isAnalyzing && detectedKeypoints && SKELETON_CONNECTIONS.map(([fromIdx, toIdx], idx) => {
                        const from = detectedKeypoints[fromIdx];
                        const to = detectedKeypoints[toIdx];

                        if (!from || !to || from.score < MIN_KEYPOINT_SCORE || to.score < MIN_KEYPOINT_SCORE) {
                            return null;
                        }

                        // Skeleton colour driven by calibration state
                        const boneColor = positionLocked
                            ? COLORS.primary
                            : positionValid
                                ? COLORS.warning
                                : hasError ? COLORS.danger : COLORS.primary;

                        return (
                            <Line
                                key={`bone-${idx}`}
                                x1={from.x}
                                y1={from.y}
                                x2={to.x}
                                y2={to.y}
                                stroke={boneColor}
                                strokeWidth="3"
                                strokeLinecap="round"
                                opacity={0.85}
                            />
                        );
                    })}

                    {/* Draw joint circles */}
                    {isAnalyzing && detectedKeypoints && detectedKeypoints.map((kp, idx) => {
                        if (!kp || kp.score < MIN_KEYPOINT_SCORE) return null;

                        const isMajorJoint = [
                            KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER,
                            KP.LEFT_ELBOW, KP.RIGHT_ELBOW,
                            KP.LEFT_WRIST, KP.RIGHT_WRIST,
                            KP.LEFT_HIP, KP.RIGHT_HIP,
                            KP.LEFT_KNEE, KP.RIGHT_KNEE,
                            KP.LEFT_ANKLE, KP.RIGHT_ANKLE,
                        ].includes(idx);

                        const jointColor = positionLocked
                            ? COLORS.primary
                            : positionValid
                                ? COLORS.warning
                                : hasError ? COLORS.danger : COLORS.primary;

                        return (
                            <Circle
                                key={`joint-${idx}`}
                                cx={kp.x}
                                cy={kp.y}
                                r={isMajorJoint ? 6 : 4}
                                fill={jointColor}
                                opacity={0.9}
                                stroke={positionLocked ? COLORS.primaryGlow : hasError ? COLORS.dangerGlow : COLORS.primaryGlow}
                                strokeWidth="2"
                            />
                        );
                    })}
                </Svg>

                {/* ===== CALIBRATION OVERLAY — Position Gate ===== */}
                {isAnalyzing && exerciseType === 'pushup' && !positionLocked && (
                    <View style={styles.calibrationOverlay}>
                        {/* Icon: Red X or Yellow hourglass */}
                        <Animated.View style={[
                            styles.calibrationIcon,
                            {
                                backgroundColor: positionValid
                                    ? COLORS.warningDim
                                    : COLORS.dangerDim,
                                borderColor: positionValid ? COLORS.warning : COLORS.danger,
                                transform: [{ scale: calibrationIconScale }],
                            }
                        ]}>
                            <Text style={[
                                styles.calibrationIconText,
                                { color: positionValid ? COLORS.warning : COLORS.danger },
                            ]}>
                                {positionValid ? '⏳' : '✗'}
                            </Text>
                        </Animated.View>

                        <Text style={[
                            styles.calibrationLabel,
                            { color: positionValid ? COLORS.warning : COLORS.danger },
                        ]}>
                            {positionValid ? 'HOLD POSITION' : 'NOT IN POSITION'}
                        </Text>

                        {/* Stabilisation progress bar */}
                        {positionValid && (
                            <View style={styles.stabBarTrack}>
                                <Animated.View style={[
                                    styles.stabBarFill,
                                    {
                                        width: stabilizationAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ['0%', '100%'],
                                        }),
                                    },
                                ]} />
                            </View>
                        )}
                    </View>
                )}

                {/* ===== POSITION LOCKED BADGE ===== */}
                {isAnalyzing && exerciseType === 'pushup' && positionLocked && (
                    <Animated.View style={[
                        styles.lockedBadge,
                        { transform: [{ scale: calibrationIconScale }] },
                    ]}>
                        <Text style={styles.lockedIcon}>✓</Text>
                        <Text style={styles.lockedLabel}>LOCKED</Text>
                    </Animated.View>
                )}

                {/* ===== TOP HUD BAR ===== */}
                <View style={styles.hudTop}>
                    <Text style={styles.hudTitle}>[ FORM_TRACKER_V6 ]</Text>
                    <View style={styles.hudRight}>
                        <Text style={styles.hudFrames}>
                            FRM:{frameCount}
                        </Text>
                        <View style={[
                            styles.statusDot,
                            { backgroundColor: tfReady ? COLORS.primary : COLORS.danger },
                        ]} />
                    </View>
                </View>

                {/* ===== PRECISION + LATENCY CARDS (Right Side) ===== */}
                <View style={styles.rightCards}>
                    {/* Precision Score */}
                    <View style={styles.precisionCard}>
                        <Text style={styles.precisionLabel}>PRECISION</Text>
                        <View style={styles.precisionCircle}>
                            <View style={[
                                styles.precisionInner,
                                {
                                    borderColor: getAccuracyColor(),
                                    shadowColor: getAccuracyColor(),
                                },
                            ]}>
                                <Text style={[styles.precisionValue, { color: getAccuracyColor() }]}>
                                    {Math.round(precision)}
                                </Text>
                                <Text style={styles.precisionPercent}>%</Text>
                            </View>
                        </View>
                        <Text style={[styles.precisionStatus, { color: getAccuracyColor() }]}>
                            {precision >= 70 ? 'OPTIMAL' : precision >= 50 ? 'DEGRADED' : 'CRITICAL'}
                        </Text>
                    </View>

                    {/* System Latency */}
                    <View style={styles.latencyCard}>
                        <Text style={styles.latencyLabel}>SYS_LATENCY</Text>
                        <Text style={[styles.latencyValue, { color: getLatencyColor() }]}>
                            {latency}
                        </Text>
                        <Text style={styles.latencyUnit}>ms</Text>
                    </View>

                    {/* Live Heart Rate (BLE) */}
                    <Animated.View style={[
                        styles.hrCard,
                        liveBpm !== null && { borderColor: liveBpm > HR_DANGER_THRESHOLD ? COLORS.danger : COLORS.cyan },
                        { transform: [{ scale: isAnalyzing && liveBpm !== null ? bpmPulse : 1 }] },
                    ]}>
                        <Text style={styles.hrLabel}>❤ BPM</Text>
                        <Text style={[
                            styles.hrValue,
                            { color: liveBpm !== null
                                ? (liveBpm > HR_DANGER_THRESHOLD ? COLORS.danger : COLORS.cyan)
                                : COLORS.textDim },
                        ]}>
                            {liveBpm !== null ? liveBpm : '--'}
                        </Text>
                        <Text style={[styles.hrStatus, {
                            color: liveBpm !== null
                                ? (liveBpm > HR_DANGER_THRESHOLD ? COLORS.danger : COLORS.cyan)
                                : COLORS.textDim
                        }]}>
                            {liveBpm === null ? 'NO_SIGNAL'
                                : liveBpm > HR_DANGER_THRESHOLD ? 'CRITICAL'
                                : liveBpm > 140 ? 'HIGH'
                                : 'NOMINAL'}
                        </Text>
                    </Animated.View>
                </View>

                {/* ===== REP COUNTER (Left Side) ===== */}
                <View style={styles.repCard}>
                    <Text style={styles.repLabel}>REPS</Text>
                    <Text style={styles.repValue}>{repCount}</Text>
                    <Text style={styles.repExercise}>{exerciseType.toUpperCase()}</Text>
                    <View style={[
                        styles.phaseIndicator,
                        {
                            backgroundColor: exercisePhase === 'DOWN'
                                ? COLORS.warningDim
                                : exercisePhase === 'UP'
                                    ? COLORS.primaryDim
                                    : COLORS.textDim,
                        }
                    ]}>
                        <Text style={[
                            styles.phaseText,
                            {
                                color: exercisePhase === 'DOWN'
                                    ? COLORS.warning
                                    : exercisePhase === 'UP'
                                        ? COLORS.primary
                                        : COLORS.textMuted,
                            }
                        ]}>
                            {exercisePhase}
                        </Text>
                    </View>
                </View>

                {/* ===== FORM ALERT BOX (Pulsing Red) ===== */}
                {hasError && alerts.length > 0 && (
                    <Animated.View style={[
                        styles.alertBox,
                        {
                            borderColor: alertBorderColor,
                            backgroundColor: alertBgColor,
                        },
                    ]}>
                        <Text style={styles.alertLabel}>⚠ FORM_ALERT</Text>
                        {alerts.slice(0, 3).map((alert, idx) => (
                            <Text key={idx} style={styles.alertText}>
                                {alert.message}
                            </Text>
                        ))}
                    </Animated.View>
                )}

                {/* ===== BOTTOM HUD ===== */}
                <View style={styles.hudBottom}>
                    {/* Status Feedback Box */}
                    <View style={[
                        styles.feedbackBox,
                        hasError && { borderColor: COLORS.danger },
                    ]}>
                        <Text style={styles.feedbackLabel}>LIVE_DIAGNOSTICS</Text>
                        <Text style={[
                            styles.feedbackText,
                            hasError && { color: COLORS.danger },
                        ]}>
                            {statusMessage}
                        </Text>
                    </View>

                    {/* Controls */}
                    <View style={styles.controls}>
                        {!isAnalyzing ? (
                            <TouchableOpacity
                                style={styles.startBtn}
                                onPress={startAnalysis}
                                disabled={!tfReady}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.btnText}>INITIATE_ANALYSIS</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.stopBtn}
                                onPress={stopAnalysis}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.btnTextLight}>TERMINATE_LINK</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.backBtn}
                            onPress={() => navigation.goBack()}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.backText}>EXIT</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </View>
    );
}


// ================================================================
//  STYLES — Dark Academia / Terminal Aesthetic
// ================================================================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
        justifyContent: 'center',
    },

    // ---- Loading / Error ----
    loadingText: {
        color: COLORS.primary,
        fontFamily: FONTS.mono,
        fontSize: 12,
        letterSpacing: 2,
        marginTop: 16,
        textAlign: 'center',
    },
    errorText: {
        color: COLORS.danger,
        fontFamily: FONTS.mono,
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
        marginTop: 100,
        paddingHorizontal: 30,
    },
    errorSub: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 11,
        textAlign: 'center',
        marginTop: 8,
    },

    // ---- Model Loading Screen ----
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    loadingTerminal: {
        width: '100%',
        backgroundColor: COLORS.surfaceGlass,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        padding: 24,
    },
    loadingTerminalHeader: {
        color: COLORS.primary,
        fontFamily: FONTS.mono,
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 2,
        textShadowColor: COLORS.primaryGlow,
        textShadowRadius: 8,
        textShadowOffset: { width: 0, height: 0 },
    },
    loadingDivider: {
        height: 1,
        backgroundColor: COLORS.border,
        marginVertical: 14,
    },
    loadingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    loadingLabel: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
    },
    loadingValue: {
        color: COLORS.primary,
        fontFamily: FONTS.mono,
        fontSize: 11,
        fontWeight: '800',
    },
    loadingProgressText: {
        color: COLORS.cyan,
        fontFamily: FONTS.mono,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    loadingSubtext: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 9,
        textAlign: 'center',
        marginTop: 16,
        lineHeight: 16,
        letterSpacing: 0.5,
    },
    loadingBackBtn: {
        marginTop: 24,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        borderRadius: 6,
    },

    // ---- Camera ----
    cameraFrame: {
        flex: 1,
        position: 'relative',
    },
    camera: {
        flex: 1,
    },

    // ---- Scan Line ----
    scanLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: COLORS.primary,
        opacity: 0.4,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 10,
        zIndex: 5,
    },

    // ---- Skeleton Overlay ----
    skeletonOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 4,
    },

    // ---- Top HUD ----
    hudTop: {
        position: 'absolute',
        top: 50,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
    },
    hudTitle: {
        color: COLORS.primary,
        fontFamily: FONTS.mono,
        fontWeight: '900',
        fontSize: 13,
        letterSpacing: 2,
        textShadowColor: COLORS.primaryGlow,
        textShadowRadius: 8,
        textShadowOffset: { width: 0, height: 0 },
    },
    hudRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    hudFrames: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 10,
        letterSpacing: 1,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        shadowColor: COLORS.primary,
        shadowRadius: 8,
        shadowOpacity: 1,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
    },

    // ---- Right Side Cards ----
    rightCards: {
        position: 'absolute',
        top: 90,
        right: 12,
        alignItems: 'center',
        gap: 10,
        zIndex: 15,
    },

    // ---- Precision Meter Card ----
    precisionCard: {
        width: 100,
        alignItems: 'center',
        backgroundColor: COLORS.surfaceGlass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    precisionLabel: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 7,
        fontWeight: '800',
        letterSpacing: 1.5,
        marginBottom: 8,
    },
    precisionCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 3,
        borderColor: COLORS.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 6,
    },
    precisionInner: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 12,
        elevation: 6,
    },
    precisionValue: {
        fontFamily: FONTS.mono,
        fontSize: 22,
        fontWeight: '900',
    },
    precisionPercent: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 10,
        fontWeight: '700',
        marginTop: -4,
    },
    precisionStatus: {
        fontFamily: FONTS.mono,
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 2,
    },

    // ---- Latency Card ----
    latencyCard: {
        width: 100,
        alignItems: 'center',
        backgroundColor: COLORS.surfaceGlass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.cyanDim,
        paddingVertical: 10,
        paddingHorizontal: 8,
    },
    latencyLabel: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 7,
        fontWeight: '800',
        letterSpacing: 1,
        marginBottom: 4,
    },
    latencyValue: {
        fontFamily: FONTS.mono,
        fontSize: 24,
        fontWeight: '900',
    },
    latencyUnit: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 9,
        fontWeight: '700',
        marginTop: -2,
    },

    // ---- Heart Rate Card (BLE Live Feed) ----
    hrCard: {
        width: 100,
        alignItems: 'center',
        backgroundColor: COLORS.surfaceGlass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.cyanDim,
        paddingVertical: 10,
        paddingHorizontal: 8,
    },
    hrLabel: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 7,
        fontWeight: '800',
        letterSpacing: 1,
        marginBottom: 4,
    },
    hrValue: {
        fontFamily: FONTS.mono,
        fontSize: 26,
        fontWeight: '900',
    },
    hrStatus: {
        fontFamily: FONTS.mono,
        fontSize: 7,
        fontWeight: '800',
        letterSpacing: 1,
        marginTop: 2,
    },

    // ---- Rep Counter Card (Left Side) ----
    repCard: {
        position: 'absolute',
        top: 90,
        left: 12,
        width: 100,
        alignItems: 'center',
        backgroundColor: COLORS.surfaceGlass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingVertical: 12,
        paddingHorizontal: 8,
        zIndex: 15,
    },
    repLabel: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 2,
        marginBottom: 4,
    },
    repValue: {
        color: COLORS.primary,
        fontFamily: FONTS.mono,
        fontSize: 36,
        fontWeight: '900',
        textShadowColor: COLORS.primaryGlow,
        textShadowRadius: 12,
        textShadowOffset: { width: 0, height: 0 },
    },
    repExercise: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 8,
        fontWeight: '700',
        letterSpacing: 1.5,
        marginTop: 2,
    },
    phaseIndicator: {
        marginTop: 8,
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 4,
    },
    phaseText: {
        fontFamily: FONTS.mono,
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 1,
    },

    // ---- Form Alert Box (Pulsing) ----
    alertBox: {
        position: 'absolute',
        bottom: 220,
        left: 16,
        right: 16,
        borderWidth: 2,
        borderRadius: 8,
        padding: 14,
        zIndex: 20,
    },
    alertLabel: {
        color: COLORS.danger,
        fontFamily: FONTS.mono,
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 2,
        marginBottom: 6,
    },
    alertText: {
        color: COLORS.white,
        fontFamily: FONTS.mono,
        fontSize: 11,
        fontWeight: '600',
        lineHeight: 18,
        marginBottom: 2,
    },

    // ---- Bottom HUD ----
    hudBottom: {
        position: 'absolute',
        bottom: 36,
        left: 16,
        right: 16,
        zIndex: 10,
    },
    feedbackBox: {
        backgroundColor: COLORS.surfaceGlass,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 14,
        borderRadius: 8,
        marginBottom: 14,
    },
    feedbackLabel: {
        color: COLORS.primary,
        fontFamily: FONTS.mono,
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 3,
        opacity: 0.7,
        marginBottom: 5,
    },
    feedbackText: {
        color: COLORS.white,
        fontFamily: FONTS.mono,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
    },
    startBtn: {
        flex: 2,
        backgroundColor: COLORS.primary,
        padding: 16,
        borderRadius: 6,
        alignItems: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 6,
    },
    stopBtn: {
        flex: 2,
        backgroundColor: COLORS.danger,
        padding: 16,
        borderRadius: 6,
        alignItems: 'center',
        shadowColor: COLORS.danger,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 6,
    },
    backBtn: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        padding: 16,
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    btnText: {
        color: COLORS.bg,
        fontFamily: FONTS.mono,
        fontWeight: '900',
        fontSize: 12,
        letterSpacing: 1,
    },
    btnTextLight: {
        color: COLORS.white,
        fontFamily: FONTS.mono,
        fontWeight: '900',
        fontSize: 12,
        letterSpacing: 1,
    },
    backText: {
        color: COLORS.white,
        fontFamily: FONTS.mono,
        fontWeight: '700',
        fontSize: 12,
    },

    // ---- Calibration Overlay ----
    calibrationOverlay: {
        position: 'absolute',
        top: '35%',
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 25,
    },
    calibrationIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 3,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 16,
        elevation: 10,
    },
    calibrationIconText: {
        fontSize: 34,
        fontWeight: '900',
    },
    calibrationLabel: {
        fontFamily: FONTS.mono,
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 3,
        marginBottom: 14,
    },

    // Stabilization progress bar
    stabBarTrack: {
        width: 200,
        height: 6,
        backgroundColor: 'rgba(255,184,0,0.2)',
        borderRadius: 3,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,184,0,0.4)',
    },
    stabBarFill: {
        height: '100%',
        backgroundColor: COLORS.warning,
        borderRadius: 3,
        shadowColor: COLORS.warning,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 8,
    },

    // Position Locked Badge
    lockedBadge: {
        position: 'absolute',
        top: '35%',
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 25,
    },
    lockedIcon: {
        fontSize: 44,
        color: COLORS.primary,
        textShadowColor: COLORS.primaryGlow,
        textShadowRadius: 20,
        textShadowOffset: { width: 0, height: 0 },
    },
    lockedLabel: {
        color: COLORS.primary,
        fontFamily: FONTS.mono,
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 4,
        marginTop: 6,
        textShadowColor: COLORS.primaryGlow,
        textShadowRadius: 10,
        textShadowOffset: { width: 0, height: 0 },
    },
});
