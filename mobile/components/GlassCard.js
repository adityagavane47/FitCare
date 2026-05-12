/**
 * GlassCard — Reusable Glassmorphism Card
 *
 * Props:
 *   children     - Card content
 *   glowColor    - 'green' | 'blue' | 'none'  (default: 'green')
 *   style        - Additional container style overrides
 *   float        - boolean: enables infinite vertical float animation (default: false)
 *   floatDelay   - ms delay before float starts (for stagger)
 *   intensity    - BlurView intensity 0-100 (default: 35)
 */

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';

const GLOW = {
    green: { shadowColor: '#39FF14', elevation: 18 },
    blue:  { shadowColor: '#3B82F6', elevation: 18 },
    none:  { shadowColor: 'transparent', elevation: 0 },
};

export default function GlassCard({
    children,
    glowColor = 'green',
    style,
    float = false,
    floatDelay = 0,
    intensity = 35,
}) {
    const glow = GLOW[glowColor] ?? GLOW.green;

    const cardContent = (
        <View style={[styles.outerShadow, { shadowColor: glow.shadowColor }, style]}>
            {/* Frosted glass layer */}
            <BlurView
                intensity={intensity}
                tint="dark"
                style={styles.blurContainer}
            >
                {/* Glass surface gradient */}
                <LinearGradient
                    colors={[
                        'rgba(255,255,255,0.07)',
                        'rgba(255,255,255,0.02)',
                        'rgba(0,0,0,0.15)',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradient}
                >
                    {/* Top-left specular highlight */}
                    <View style={styles.specularTL} />
                    {/* Content */}
                    <View style={styles.content}>
                        {children}
                    </View>
                </LinearGradient>
            </BlurView>
        </View>
    );

    if (float) {
        return (
            <MotiView
                from={{ translateY: 0 }}
                animate={{ translateY: [-8, 0, -8] }}
                transition={{
                    type: 'timing',
                    duration: 3200,
                    loop: true,
                    delay: floatDelay,
                    repeatReverse: false,
                }}
            >
                {cardContent}
            </MotiView>
        );
    }

    return cardContent;
}

// ─── Entry Wrapper ─────────────────────────────────────────────────────────────
// Use this to animate cards floating up from the bottom on mount
export function FloatInCard({ children, delay = 0 }) {
    return (
        <MotiView
            from={{ opacity: 0, translateY: 40 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{
                type: 'spring',
                damping: 18,
                stiffness: 120,
                delay,
            }}
        >
            {children}
        </MotiView>
    );
}

const styles = StyleSheet.create({
    outerShadow: {
        borderRadius: 20,
        marginBottom: 16,
        // Neon underglow — works on iOS natively
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.55,
        shadowRadius: 14,
        // Android elevation uses the shadowColor set inline
        elevation: 18,
    },

    blurContainer: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.13)',
    },

    gradient: {
        borderRadius: 20,
        // Fallback for Android where BlurView may be translucent only
        backgroundColor: Platform.OS === 'android' ? 'rgba(12,12,18,0.82)' : 'transparent',
    },

    // Small top-left glint to sell the "glass" illusion
    specularTL: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 120,
        height: 1.5,
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderTopLeftRadius: 20,
    },

    content: {
        padding: 20,
    },
});
