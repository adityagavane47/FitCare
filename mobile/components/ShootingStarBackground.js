/**
 * ShootingStarBackground
 *
 * Renders a subtle dark grid (SVG) with 5 neon-green "shooting star"
 * light streaks animated via Reanimated — zero React re-renders after mount.
 *
 * Usage:
 *   <ShootingStarBackground />          ← renders behind everything
 *   <ShootingStarBackground opacity={0.4} starCount={3} />
 */

import React, { useMemo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Svg, { Line, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';

const { width: W, height: H } = Dimensions.get('window');

const NEON        = '#39FF14';
const GRID_COLOR  = '#111111';
const CELL_SIZE   = 44;          // grid cell size in px
const STAR_LENGTH = 90;          // tail length in px
const STAR_WIDTH  = 2;           // streak thickness
const STAR_SPEED  = 900;         // ms to travel across one screen dimension
const PAUSE_MIN   = 600;
const PAUSE_MAX   = 2400;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max));

// ─── SVG Grid ────────────────────────────────────────────────────────────────
const GridLayer = React.memo(({ opacity }) => {
    const cols = Math.ceil(W / CELL_SIZE) + 1;
    const rows = Math.ceil(H / CELL_SIZE) + 1;

    const verticals = useMemo(() =>
        Array.from({ length: cols }, (_, i) => (
            <Line
                key={`v${i}`}
                x1={i * CELL_SIZE} y1={0}
                x2={i * CELL_SIZE} y2={H}
                stroke={GRID_COLOR}
                strokeWidth={0.8}
            />
        )), [cols]);

    const horizontals = useMemo(() =>
        Array.from({ length: rows }, (_, i) => (
            <Line
                key={`h${i}`}
                x1={0} y1={i * CELL_SIZE}
                x2={W} y2={i * CELL_SIZE}
                stroke={GRID_COLOR}
                strokeWidth={0.8}
            />
        )), [rows]);

    return (
        <Svg
            width={W}
            height={H}
            style={[StyleSheet.absoluteFill, { opacity }]}
        >
            {verticals}
            {horizontals}
        </Svg>
    );
});

// ─── Single Shooting Star ────────────────────────────────────────────────────
/**
 * Each star config is fixed at mount time:
 *   axis      : 'h' | 'v'
 *   trackPos  : which grid line (px) the star travels on
 *   initialDelay : stagger so stars don't all start together
 */
const ShootingStar = ({ config }) => {
    const { axis, trackPos, initialDelay } = config;

    const progress = useSharedValue(-STAR_LENGTH); // starts off-screen

    // Kick off the repeating animation once
    React.useEffect(() => {
        const travelDistance = axis === 'h' ? W + STAR_LENGTH : H + STAR_LENGTH;
        const pause = rand(PAUSE_MIN, PAUSE_MAX);

        progress.value = withDelay(
            initialDelay,
            withRepeat(
                withSequence(
                    withTiming(travelDistance, {
                        duration: STAR_SPEED + rand(-200, 200),
                        easing: Easing.linear,
                    }),
                    // "Pause" — snap back to start instantly then hold
                    withTiming(-STAR_LENGTH, { duration: 0 }),
                    withDelay(pause, withTiming(-STAR_LENGTH, { duration: 0 })),
                ),
                -1,   // infinite
                false // don't reverse
            )
        );
    }, []);

    const starStyle = useAnimatedStyle(() => {
        if (axis === 'h') {
            return {
                transform: [{ translateX: progress.value }],
                top: trackPos - STAR_WIDTH / 2,
                left: 0,
                width: STAR_LENGTH,
                height: STAR_WIDTH,
            };
        }
        return {
            transform: [{ translateY: progress.value }],
            left: trackPos - STAR_WIDTH / 2,
            top: 0,
            width: STAR_WIDTH,
            height: STAR_LENGTH,
        };
    });

    // The gradient SVG "head + fading tail"
    const gradId = `g${axis}${Math.round(trackPos)}`;
    const svgW = axis === 'h' ? STAR_LENGTH : STAR_WIDTH;
    const svgH = axis === 'h' ? STAR_WIDTH : STAR_LENGTH;

    return (
        <Animated.View style={[styles.starBase, starStyle]} pointerEvents="none">
            <Svg width={svgW} height={svgH}>
                <Defs>
                    <LinearGradient
                        id={gradId}
                        x1={axis === 'h' ? '100%' : '0%'}
                        y1={axis === 'h' ? '0%' : '100%'}
                        x2={axis === 'h' ? '0%' : '0%'}
                        y2={axis === 'h' ? '0%' : '0%'}
                    >
                        <Stop offset="0%" stopColor={NEON} stopOpacity="0.95" />
                        <Stop offset="60%" stopColor={NEON} stopOpacity="0.3" />
                        <Stop offset="100%" stopColor={NEON} stopOpacity="0" />
                    </LinearGradient>
                </Defs>
                <Rect
                    x={0} y={0}
                    width={svgW} height={svgH}
                    fill={`url(#${gradId})`}
                />
            </Svg>
        </Animated.View>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ShootingStarBackground({
    opacity = 0.85,
    starCount = 5,
}) {
    const cols = Math.ceil(W / CELL_SIZE);
    const rows = Math.ceil(H / CELL_SIZE);

    // Generate star configs once at mount — deterministic so no re-renders
    const stars = useMemo(() => {
        return Array.from({ length: starCount }, (_, i) => {
            const axis = i % 2 === 0 ? 'h' : 'v'; // alternate h/v
            const trackPos = axis === 'h'
                ? randInt(1, rows) * CELL_SIZE      // snap to horizontal grid line
                : randInt(1, cols) * CELL_SIZE;     // snap to vertical grid line
            return {
                id: i,
                axis,
                trackPos,
                initialDelay: i * randInt(300, 700), // stagger start times
            };
        });
    }, [starCount]);

    return (
        <View style={styles.container} pointerEvents="none">
            <GridLayer opacity={opacity} />
            {stars.map((cfg) => (
                <ShootingStar key={cfg.id} config={cfg} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000',
    },
    starBase: {
        position: 'absolute',
    },
});
