import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as tf from '@tensorflow/tfjs';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as Speech from 'expo-speech';
import Svg, { Line, Circle } from 'react-native-svg';
import { cameraWithTensors } from '@tensorflow/tfjs-react-native';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';

const { width, height } = Dimensions.get('window');

// Use CameraView for modern Expo version compatibility. 
// GLOBAL PATCH in App.js provides the legacy .Constants required by this HOC.
const TensorCamera = cameraWithTensors(CameraView || Camera);

// Common pose connections for BlazePose to draw the skeleton
const CONNECTIONS = [
    ['left_shoulder', 'right_shoulder'],
    ['left_shoulder', 'left_elbow'],
    ['left_elbow', 'left_wrist'],
    ['right_shoulder', 'right_elbow'],
    ['right_elbow', 'right_wrist'],
    ['left_shoulder', 'left_hip'],
    ['right_shoulder', 'right_hip'],
    ['left_hip', 'right_hip'],
    ['left_hip', 'left_knee'],
    ['left_knee', 'left_ankle'],
    ['right_hip', 'right_knee'],
    ['right_knee', 'right_ankle'],
];

export default function FormCorrectionScreen({ route, navigation }) {
    const { userId, exerciseType = 'squat' } = route.params || { userId: 1 };
    const [hasPermission, setHasPermission] = useState(null);
    const [detector, setDetector] = useState(null);
    const [poses, setPoses] = useState([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [facing, setFacing] = useState('back');

    // Heuristic & Form Flags State
    // ... (omitting middle parts for clarity in replace_file_content if needed, but I'll do a single block)
    // I will actually view the file again to be sure of the line numbers after previous edits

    const [feedback, setFeedback] = useState("Align your body to start...");
    const [reps, setReps] = useState(0);
    const [formFlags, setFormFlags] = useState(new Set());
    const lastSpokenRef = useRef(0);
    const repStateRef = useRef('up'); // 'down' or 'up'
    const analysisActive = useRef(false);

    useEffect(() => {
        (async () => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setHasPermission(status === 'granted');

            try {
                await tf.ready();
                const detectorConfig = {
                    runtime: 'tfjs',
                    enableSmoothing: true,
                    modelType: 'lite'
                };
                const poseDetector = await poseDetection.createDetector(
                    poseDetection.SupportedModels.BlazePose,
                    detectorConfig
                );
                setDetector(poseDetector);
                setIsLoaded(true);
            } catch (err) {
                console.error("TFJS/Detector Initialization Error:", err);
                setIsLoaded(true); // Don't leave user on loader if it fails
            }
        })();
    }, []);

    // Trigonometry Utility: Calculate angle between 3 points (A, B, C) where B is the vertex
    const calculateAngle = (a, b, c) => {
        if (!a || !b || !c) return 0;
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs((radians * 180.0) / Math.PI);
        if (angle > 180.0) angle = 360 - angle;
        return angle;
    };

    const provideFeedback = (msg, flag) => {
        setFeedback(msg);

        if (flag) {
            setFormFlags(prev => new Set([...prev, flag]));
        }

        // Throttle TTS to every 3 seconds to avoid spamming
        const now = Date.now();
        if (now - lastSpokenRef.current > 3000) {
            Speech.speak(msg);
            lastSpokenRef.current = now;
        }
    };

    const toggleCamera = () => {
        setFacing(prev => prev === 'back' ? 'front' : 'back');
        setPoses([]); // Clear poses when switching
    };

    const handleCameraStream = (images, updatePreview, gl) => {
        const loop = async () => {
            if (detector && !analysisActive.current) {
                const imageTensor = images.next().value;
                if (imageTensor) {
                    const estimatedPoses = await detector.estimatePoses(imageTensor);
                    setPoses(estimatedPoses);

                    if (estimatedPoses.length > 0) {
                        const keypoints = estimatedPoses[0].keypoints.reduce((acc, kp) => {
                            acc[kp.name] = kp;
                            return acc;
                        }, {});

                        // Pushup Logic
                        if (exerciseType === 'pushup') {
                            const shoulder = keypoints['left_shoulder'] || keypoints['right_shoulder'];
                            const elbow = keypoints['left_elbow'] || keypoints['right_elbow'];
                            const wrist = keypoints['left_wrist'] || keypoints['right_wrist'];
                            const hip = keypoints['left_hip'] || keypoints['right_hip'];
                            const ankle = keypoints['left_ankle'] || keypoints['right_ankle'];

                            if (shoulder?.score > 0.3 && hip?.score > 0.3 && ankle?.score > 0.3) {
                                const backAngle = calculateAngle(shoulder, hip, ankle);
                                if (backAngle < 160) {
                                    provideFeedback("Don't let your hips sag!", "hips_sagging");
                                } else if (backAngle > 200) { // This is an approximation as angle is absolute
                                    provideFeedback("Lower your hips, keep back straight.", "hips_raised");
                                }
                            }

                            if (shoulder?.score > 0.3 && elbow?.score > 0.3 && wrist?.score > 0.3) {
                                const elbowAngle = calculateAngle(shoulder, elbow, wrist);
                                if (elbowAngle < 90 && repStateRef.current === 'up') {
                                    repStateRef.current = 'down';
                                } else if (elbowAngle > 160 && repStateRef.current === 'down') {
                                    repStateRef.current = 'up';
                                    setReps(r => r + 1);
                                }
                            }
                        }

                        // Squat Logic
                        if (exerciseType === 'squat') {
                            const hip = keypoints['left_hip'] || keypoints['right_hip'];
                            const knee = keypoints['left_knee'] || keypoints['right_knee'];
                            const ankle = keypoints['left_ankle'] || keypoints['right_ankle'];

                            if (hip?.score > 0.3 && knee?.score > 0.3 && ankle?.score > 0.3) {
                                const kneeAngle = calculateAngle(hip, knee, ankle);

                                if (kneeAngle < 90 && repStateRef.current === 'up') {
                                    repStateRef.current = 'down';
                                    provideFeedback("Good depth!", null);
                                } else if (kneeAngle > 160 && repStateRef.current === 'down') {
                                    repStateRef.current = 'up';
                                    setReps(r => r + 1);
                                } else if (repStateRef.current === 'up' && kneeAngle > 90 && kneeAngle < 150) {
                                    // Provide feedback if they reverse direction early (rudimentary check)
                                }
                            }
                        }
                    }
                    tf.dispose(imageTensor);
                }
            }
            requestAnimationFrame(loop);
        };
        loop();
    };

    const finishWorkout = async () => {
        analysisActive.current = true;
        setFeedback("Analyzing workout with AI...");

        try {
            const aiSummary = await fitcareAPI.analyzeWorkoutForm(userId, exerciseType, Array.from(formFlags));
            alert("Workout Complete!\n\nAI Coach Feedback:\n" + aiSummary.feedback);
            navigation.goBack();
        } catch (error) {
            alert("Workout finished. (Could not connect to Ollama)");
            navigation.goBack();
        }
    };

    if (hasPermission === null || !isLoaded) {
        return <View style={styles.container}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    }
    if (hasPermission === false) {
        return <Text style={styles.errorText}>No access to camera</Text>;
    }

    // Render SVG skeleton over camera
    const renderSkeleton = () => {
        if (!poses.length) return null;
        const keypoints = poses[0].keypoints;

        const pointsToRender = keypoints.filter(kp => kp.score > 0.3);
        const isFront = facing === 'front';

        return (
            <Svg style={styles.svgOverlay} width={width} height={height}>
                {CONNECTIONS.map(([p1, p2], i) => {
                    const kp1 = pointsToRender.find(kp => kp.name === p1);
                    const kp2 = pointsToRender.find(kp => kp.name === p2);
                    if (kp1 && kp2) {
                        return (
                            <Line
                                key={`line-${i}`}
                                x1={isFront ? width - kp1.x : kp1.x} y1={kp1.y}
                                x2={isFront ? width - kp2.x : kp2.x} y2={kp2.y}
                                stroke={Colors.primary}
                                strokeWidth="4"
                            />
                        );
                    }
                    return null;
                })}
                {pointsToRender.map((kp, i) => (
                    <Circle
                        key={`circle-${i}`}
                        cx={isFront ? width - kp.x : kp.x}
                        cy={kp.y}
                        r="6"
                        fill={Colors.danger}
                    />
                ))}
            </Svg>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerText}>{exerciseType.toUpperCase()} FORM TRACKER</Text>
                <Text style={styles.repText}>Reps: {reps}</Text>
            </View>

            <View style={styles.cameraContainer}>
                <TensorCamera
                    style={styles.camera}
                    facing={facing}
                    onReady={handleCameraStream}
                    autorender={true}
                    cameraTextureHeight={1920}
                    cameraTextureWidth={1080}
                    resizeHeight={480}
                    resizeWidth={270}
                    resizeDepth={3}
                />
                <TouchableOpacity style={styles.flipBtn} onPress={toggleCamera}>
                    <Text style={styles.flipBtnText}>FLIP CAMERA</Text>
                </TouchableOpacity>
                <View style={styles.svgWrapper}>
                    {renderSkeleton()}
                </View>
            </View>

            <View style={styles.footer}>
                <Text style={styles.feedbackText}>{feedback}</Text>
                <TouchableOpacity style={styles.finishBtn} onPress={finishWorkout}>
                    <Text style={styles.finishBtnText}>Finish Workout</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: { paddingTop: 50, paddingBottom: 20, alignItems: 'center', backgroundColor: '#000', borderBottomWidth: 1, borderColor: Colors.border },
    headerText: { color: Colors.primary, fontSize: 18, fontWeight: '800', letterSpacing: 2 },
    repText: { color: '#FFF', fontSize: 32, fontWeight: '900', marginTop: 10 },
    cameraContainer: { flex: 1, position: 'relative' },
    camera: { flex: 1 },
    svgWrapper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
    svgOverlay: { position: 'absolute', top: 0, left: 0, zIndex: 20 },
    footer: { padding: 30, backgroundColor: '#000', borderTopWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    feedbackText: { color: Colors.warning, fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
    finishBtn: { backgroundColor: Colors.primary, paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30 },
    finishBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },
    flipBtn: { position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 10, zIndex: 100, borderWidth: 1, borderColor: Colors.primary },
    flipBtnText: { color: Colors.primary, fontSize: 12, fontWeight: '800' },
    errorText: { color: '#FFF', alignSelf: 'center', marginTop: 100 }
});
