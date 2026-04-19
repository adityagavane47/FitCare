import React, { useRef, useState, useEffect } from 'react';
import {
    View, Text, TextInput, StyleSheet, FlatList, Modal,
    ActivityIndicator, Animated, Pressable, KeyboardAvoidingView,
    Platform, Dimensions, StatusBar, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';
import CustomHeader from '../components/CustomHeader';

const USDA_KEY_STORAGE = '@fitcare_usda_api_key';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Scanline overlay component for cyberpunk atmosphere ───
const Scanlines = () => (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 60 }).map((_, i) => (
            <View
                key={i}
                style={{
                    position: 'absolute',
                    top: i * 12,
                    left: 0,
                    right: 0,
                    height: 1,
                    backgroundColor: 'rgba(57, 255, 20, 0.015)',
                }}
            />
        ))}
    </View>
);

// ─── Animated macro badge ───
const MacroBadge = ({ label, value, unit, color }) => (
    <View style={[styles.macroBadge, { borderColor: color }]}>
        <Text style={[styles.macroBadgeValue, { color }]}>{value}</Text>
        <Text style={styles.macroBadgeUnit}>{unit}</Text>
        <Text style={styles.macroBadgeLabel}>{label}</Text>
    </View>
);

// ─── Extracted food card component (hooks must live in a component) ───
const FoodCard = ({ item, index, onLog, disabled }) => {
    const cardAnim = useRef(new Animated.Value(0)).current;
    const cardScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.timing(cardAnim, {
            toValue: 1,
            duration: 350,
            delay: index * 80,
            useNativeDriver: true,
        }).start();
    }, []);

    return (
        <Animated.View
            style={{
                opacity: cardAnim,
                transform: [{
                    translateY: cardAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [30, 0],
                    }),
                }],
            }}
        >
            <Animated.View style={{ transform: [{ scale: cardScale }] }}>
                <Pressable
                    style={styles.foodCard}
                    onPress={() => onLog(item)}
                    disabled={disabled}
                    onPressIn={() =>
                        Animated.spring(cardScale, {
                            toValue: 0.96,
                            useNativeDriver: true,
                            speed: 50,
                            bounciness: 4,
                        }).start()
                    }
                    onPressOut={() =>
                        Animated.spring(cardScale, {
                            toValue: 1,
                            useNativeDriver: true,
                            speed: 20,
                            bounciness: 10,
                        }).start()
                    }
                >
                    {/* Food name + calorie header */}
                    <View style={styles.foodCardHeader}>
                        <Text style={styles.foodCardName} numberOfLines={1}>
                            {item.name}
                        </Text>
                        <View style={styles.calorieTag}>
                            <Text style={styles.calorieTagText}>
                                {item.calories} kcal
                            </Text>
                        </View>
                    </View>

                    {/* Macro badges row */}
                    <View style={styles.macroRow}>
                        <MacroBadge label="PROTEIN" value={item.protein} unit="g" color="#39FF14" />
                        <MacroBadge label="CARBS" value={item.carbs} unit="g" color="#00E5FF" />
                        <MacroBadge label="FATS" value={item.fats} unit="g" color="#FF9100" />
                    </View>

                    {/* Tap instruction */}
                    <Text style={styles.tapHint}>TAP TO LOG ›</Text>
                </Pressable>
            </Animated.View>
        </Animated.View>
    );
};

const LogFoodScreen = ({ navigation }) => {
    // ─── State ───
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isLogging, setIsLogging] = useState(false);
    const [selectedFood, setSelectedFood] = useState(null);
    const [aiFeedback, setAiFeedback] = useState('');
    const [showInsightModal, setShowInsightModal] = useState(false);
    const [dataSource, setDataSource] = useState('');
    const [usdaKey, setUsdaKey] = useState('');
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [configKeyInput, setConfigKeyInput] = useState('');

    // ─── Animations ───
    const searchBtnScale = useRef(new Animated.Value(1)).current;
    const resultsOpacity = useRef(new Animated.Value(0)).current;
    const insightSlide = useRef(new Animated.Value(300)).current;
    const insightOpacity = useRef(new Animated.Value(0)).current;
    const headerGlow = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // Load USDA key from AsyncStorage on mount
    useEffect(() => {
        (async () => {
            try {
                const savedKey = await AsyncStorage.getItem(USDA_KEY_STORAGE);
                if (savedKey) setUsdaKey(savedKey);
            } catch (e) {
                console.warn('Failed to load USDA key:', e);
            }
        })();
    }, []);

    // Boot-up glow animation for the header
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(headerGlow, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: false,
                }),
                Animated.timing(headerGlow, {
                    toValue: 0,
                    duration: 2000,
                    useNativeDriver: false,
                }),
            ])
        ).start();
    }, []);

    // Pulse animation for the logging indicator
    useEffect(() => {
        if (isLogging) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.1,
                        duration: 600,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 600,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isLogging]);

    // ─── Search handler ───
    const handleSearch = async () => {
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        setSearchResults([]);
        setAiFeedback('');
        setSelectedFood(null);
        resultsOpacity.setValue(0);

        try {
            const response = await fitcareAPI.searchFood(searchQuery.trim(), usdaKey || null);
            setSearchResults(response.results || []);
            setDataSource(response.source || 'local');

            // Animate results appearing
            Animated.timing(resultsOpacity, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }).start();
        } catch (err) {
            setSearchResults([]);
            console.error('Search failed:', err.message);
        } finally {
            setIsSearching(false);
        }
    };

    // ─── Log food handler ───
    const handleLogFood = async (food) => {
        setSelectedFood(food);
        setIsLogging(true);

        try {
            const response = await fitcareAPI.logFoodItem({
                food_name: food.name,
                calories: food.calories,
                protein_g: food.protein,
                carbs_g: food.carbs,
                fats_g: food.fats,
            });

            if (response.ai_feedback) {
                setAiFeedback(response.ai_feedback);
            } else {
                setAiFeedback(`Logged ${food.calories} kcal of ${food.name}. Keep going!`);
            }

            // Show insight modal with animation
            setShowInsightModal(true);
            insightSlide.setValue(300);
            insightOpacity.setValue(0);

            Animated.parallel([
                Animated.spring(insightSlide, {
                    toValue: 0,
                    friction: 8,
                    tension: 40,
                    useNativeDriver: true,
                }),
                Animated.timing(insightOpacity, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
            ]).start();
        } catch (err) {
            console.error('Log failed:', err.message);
            setAiFeedback('SYSTEM ERROR: Failed to log food entry. Try again.');
            setShowInsightModal(true);
        } finally {
            setIsLogging(false);
        }
    };

    // ─── Dismiss insight and go home ───
    const handleDismissAndGoHome = () => {
        Animated.parallel([
            Animated.timing(insightSlide, {
                toValue: 300,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(insightOpacity, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setShowInsightModal(false);
            navigation.goBack();
        });
    };

    const handleDismissAndStay = () => {
        Animated.parallel([
            Animated.timing(insightSlide, {
                toValue: 300,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(insightOpacity, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setShowInsightModal(false);
            setSelectedFood(null);
            setAiFeedback('');
        });
    };

    // ─── Interpolated glow color ───
    const glowBorderColor = headerGlow.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(57, 255, 20, 0.15)', 'rgba(57, 255, 20, 0.6)'],
    });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />
            <CustomHeader title="Smart Log" />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* ─── Search Section ─── */}
                <Animated.View style={[styles.searchSection, { borderColor: glowBorderColor }]}>
                    <View style={styles.searchLabelRow}>
                        <Text style={styles.sectionTag}>⚡ FOOD SEARCH</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {dataSource ? (
                                <View style={styles.sourceTag}>
                                    <View style={[
                                        styles.sourceDot,
                                        { backgroundColor: dataSource === 'usda' ? '#39FF14' : '#FF9100' }
                                    ]} />
                                    <Text style={styles.sourceText}>
                                        {dataSource === 'usda' ? 'USDA API' : 'LOCAL DB'}
                                    </Text>
                                </View>
                            ) : null}
                            <Pressable
                                style={styles.configButton}
                                onPress={() => {
                                    setConfigKeyInput(usdaKey);
                                    setShowConfigModal(true);
                                }}
                            >
                                <Text style={styles.configButtonText}>⚙</Text>
                            </Pressable>
                        </View>
                    </View>
                    <Text style={styles.sectionSub}>
                        Search a dish. Tap to log. AI will analyze your intake.
                    </Text>

                    <View style={styles.searchInputRow}>
                        <TextInput
                            style={styles.searchInput}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder="e.g. Chicken Biryani"
                            placeholderTextColor="#333"
                            selectionColor={Colors.primary}
                            returnKeyType="search"
                            onSubmitEditing={handleSearch}
                        />
                        <Animated.View style={{ transform: [{ scale: searchBtnScale }] }}>
                            <Pressable
                                style={[styles.searchButton, isSearching && styles.searchButtonDisabled]}
                                disabled={isSearching}
                                onPress={handleSearch}
                                onPressIn={() =>
                                    Animated.spring(searchBtnScale, {
                                        toValue: 0.92,
                                        useNativeDriver: true,
                                        speed: 50,
                                        bounciness: 4,
                                    }).start()
                                }
                                onPressOut={() =>
                                    Animated.spring(searchBtnScale, {
                                        toValue: 1,
                                        useNativeDriver: true,
                                        speed: 20,
                                        bounciness: 10,
                                    }).start()
                                }
                            >
                                {isSearching ? (
                                    <ActivityIndicator color="#000" size="small" />
                                ) : (
                                    <Text style={styles.searchButtonText}>SEARCH</Text>
                                )}
                            </Pressable>
                        </Animated.View>
                    </View>
                </Animated.View>

                {/* ─── Loading overlay while logging ─── */}
                {isLogging && (
                    <Animated.View style={[styles.loggingOverlay, { transform: [{ scale: pulseAnim }] }]}>
                        <ActivityIndicator color="#39FF14" size="large" />
                        <Text style={styles.loggingText}>ANALYZING MEAL...</Text>
                        <Text style={styles.loggingSubtext}>
                            AI evaluating against your goals
                        </Text>
                    </Animated.View>
                )}

                {/* ─── Search Results ─── */}
                {!isLogging && searchResults.length > 0 && (
                    <Animated.View style={[styles.resultsContainer, { opacity: resultsOpacity }]}>
                        <Text style={styles.resultsHeader}>
                            ▸ {searchResults.length} RESULTS FOUND
                        </Text>
                        <FlatList
                            data={searchResults}
                            keyExtractor={(item, idx) => item.id || `food-${idx}`}
                            renderItem={({ item, index }) => (
                                <FoodCard 
                                    item={item} 
                                    index={index} 
                                    onLog={handleLogFood} 
                                    disabled={isLogging} 
                                />
                            )}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 100 }}
                        />
                    </Animated.View>
                )}

                {/* ─── Empty state ─── */}
                {!isLogging && !isSearching && searchResults.length === 0 && (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🔍</Text>
                        <Text style={styles.emptyTitle}>AWAITING INPUT</Text>
                        <Text style={styles.emptySubtext}>
                            Type a dish name above and hit SEARCH{'\n'}to query the nutrition database.
                        </Text>
                    </View>
                )}
            </KeyboardAvoidingView>

            {/* ─── AI Insight Modal ─── */}
            <Modal
                visible={showInsightModal}
                transparent
                animationType="none"
                onRequestClose={handleDismissAndStay}
            >
                <View style={styles.modalOverlay}>
                    <Animated.View
                        style={[
                            styles.insightCard,
                            {
                                transform: [{ translateY: insightSlide }],
                                opacity: insightOpacity,
                            },
                        ]}
                    >
                        {/* Glowing header bar */}
                        <View style={styles.insightHeaderBar}>
                            <View style={styles.insightDot} />
                            <Text style={styles.insightHeaderText}>AI INSIGHT</Text>
                            <View style={styles.insightDot} />
                        </View>

                        {/* Food logged info */}
                        {selectedFood && (
                            <View style={styles.insightFoodRow}>
                                <Text style={styles.insightFoodName}>
                                    {selectedFood.name}
                                </Text>
                                <Text style={styles.insightFoodCal}>
                                    {selectedFood.calories} KCAL
                                </Text>
                            </View>
                        )}

                        {/* Macro summary in modal */}
                        {selectedFood && (
                            <View style={styles.insightMacroRow}>
                                <View style={styles.insightMacroPill}>
                                    <Text style={[styles.insightMacroVal, { color: '#39FF14' }]}>
                                        {selectedFood.protein}g
                                    </Text>
                                    <Text style={styles.insightMacroLabel}>P</Text>
                                </View>
                                <View style={styles.insightMacroPill}>
                                    <Text style={[styles.insightMacroVal, { color: '#00E5FF' }]}>
                                        {selectedFood.carbs}g
                                    </Text>
                                    <Text style={styles.insightMacroLabel}>C</Text>
                                </View>
                                <View style={styles.insightMacroPill}>
                                    <Text style={[styles.insightMacroVal, { color: '#FF9100' }]}>
                                        {selectedFood.fats}g
                                    </Text>
                                    <Text style={styles.insightMacroLabel}>F</Text>
                                </View>
                            </View>
                        )}

                        {/* Divider */}
                        <View style={styles.insightDivider} />

                        {/* AI Feedback Text */}
                        <Text style={styles.insightFeedback}>{aiFeedback}</Text>

                        {/* Action Buttons */}
                        <View style={styles.insightActions}>
                            <Pressable
                                style={styles.insightBtnSecondary}
                                onPress={handleDismissAndStay}
                            >
                                <Text style={styles.insightBtnSecondaryText}>
                                    LOG MORE
                                </Text>
                            </Pressable>
                            <Pressable
                                style={styles.insightBtnPrimary}
                                onPress={handleDismissAndGoHome}
                            >
                                <Text style={styles.insightBtnPrimaryText}>
                                    ← HOME
                                </Text>
                            </Pressable>
                        </View>
                    </Animated.View>
                </View>
            </Modal>

            {/* ─── API Key Config Modal ─── */}
            <Modal
                visible={showConfigModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowConfigModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.configCard}>
                        {/* Header */}
                        <View style={styles.configHeader}>
                            <View style={styles.insightDot} />
                            <Text style={styles.configHeaderText}>API CONFIG</Text>
                            <View style={styles.insightDot} />
                        </View>

                        <Text style={styles.configDescription}>
                            Enter your USDA FoodData Central API key to search{' '}
                            real food data. Get a free key at{' '}
                            fdc.nal.usda.gov/api-key-signup
                        </Text>

                        {/* Key Input */}
                        <Text style={styles.configLabel}>USDA API KEY</Text>
                        <TextInput
                            style={styles.configInput}
                            value={configKeyInput}
                            onChangeText={setConfigKeyInput}
                            placeholder="Paste your API key here"
                            placeholderTextColor="#333"
                            selectionColor={Colors.primary}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        {/* Status indicator */}
                        <View style={styles.configStatus}>
                            <View style={[
                                styles.sourceDot,
                                { backgroundColor: usdaKey ? '#39FF14' : '#FF9100' }
                            ]} />
                            <Text style={styles.configStatusText}>
                                {usdaKey ? 'KEY CONFIGURED' : 'NO KEY SET — USING LOCAL DB'}
                            </Text>
                        </View>

                        {/* Actions */}
                        <View style={styles.insightActions}>
                            <Pressable
                                style={styles.insightBtnSecondary}
                                onPress={() => setShowConfigModal(false)}
                            >
                                <Text style={styles.insightBtnSecondaryText}>CANCEL</Text>
                            </Pressable>
                            <Pressable
                                style={styles.insightBtnPrimary}
                                onPress={async () => {
                                    const trimmed = configKeyInput.trim();
                                    try {
                                        if (trimmed) {
                                            await AsyncStorage.setItem(USDA_KEY_STORAGE, trimmed);
                                        } else {
                                            await AsyncStorage.removeItem(USDA_KEY_STORAGE);
                                        }
                                        setUsdaKey(trimmed);
                                        setShowConfigModal(false);
                                        Alert.alert(
                                            trimmed ? '✅ Key Saved' : '🔧 Key Removed',
                                            trimmed
                                                ? 'Your USDA API key has been saved. Searches will now use live data.'
                                                : 'API key removed. Searches will use the local database.'
                                        );
                                    } catch (e) {
                                        Alert.alert('Error', 'Failed to save API key.');
                                    }
                                }}
                            >
                                <Text style={styles.insightBtnPrimaryText}>SAVE</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            <Scanlines />
        </View>
    );
};

// ════════════════════════════════════════
//  STYLES — Dark Cyber Terminal Aesthetic
// ════════════════════════════════════════
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },

    // ─── Search Section ───
    searchSection: {
        backgroundColor: '#050A0E',
        borderWidth: 1.5,
        borderRadius: 16,
        padding: 18,
        marginHorizontal: 16,
        marginTop: 14,
        shadowColor: '#39FF14',
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 6,
    },
    searchLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    sectionTag: {
        color: '#39FF14',
        fontWeight: '900',
        fontSize: 13,
        letterSpacing: 2,
    },
    sourceTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    sourceDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 5,
    },
    sourceText: {
        color: '#555',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1,
    },
    sectionSub: {
        color: '#444',
        fontSize: 11,
        marginBottom: 16,
        lineHeight: 16,
    },
    searchInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    searchInput: {
        flex: 1,
        backgroundColor: '#0A0F14',
        borderWidth: 1,
        borderColor: 'rgba(57, 255, 20, 0.2)',
        borderRadius: 10,
        color: '#FFF',
        fontSize: 16,
        paddingHorizontal: 14,
        paddingVertical: 13,
        fontWeight: '600',
    },
    searchButton: {
        backgroundColor: '#39FF14',
        borderRadius: 10,
        paddingHorizontal: 20,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#39FF14',
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 8,
    },
    searchButtonDisabled: {
        backgroundColor: 'rgba(57, 255, 20, 0.3)',
    },
    searchButtonText: {
        color: '#000',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
    },

    // ─── Results Section ───
    resultsContainer: {
        flex: 1,
        paddingHorizontal: 16,
        marginTop: 8,
    },
    resultsHeader: {
        color: '#39FF14',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 2,
        marginBottom: 10,
        marginLeft: 4,
    },

    // ─── Food Card ───
    foodCard: {
        backgroundColor: '#060C12',
        borderWidth: 1,
        borderColor: 'rgba(57, 255, 20, 0.12)',
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
        shadowColor: '#39FF14',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    foodCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    foodCardName: {
        color: '#EAEAEA',
        fontSize: 16,
        fontWeight: '700',
        flex: 1,
        marginRight: 10,
    },
    calorieTag: {
        backgroundColor: 'rgba(57, 255, 20, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(57, 255, 20, 0.3)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    calorieTagText: {
        color: '#39FF14',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1,
    },
    macroRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    macroBadge: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderWidth: 1,
        borderRadius: 8,
        paddingVertical: 8,
        alignItems: 'center',
    },
    macroBadgeValue: {
        fontSize: 16,
        fontWeight: '900',
    },
    macroBadgeUnit: {
        color: '#555',
        fontSize: 9,
        fontWeight: '700',
        marginTop: 1,
    },
    macroBadgeLabel: {
        color: '#333',
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 1.5,
        marginTop: 3,
    },
    tapHint: {
        color: '#333',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 2,
        textAlign: 'right',
        marginTop: 10,
    },

    // ─── Empty State ───
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 80,
    },
    emptyIcon: {
        fontSize: 40,
        marginBottom: 12,
    },
    emptyTitle: {
        color: '#39FF14',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 3,
        marginBottom: 8,
    },
    emptySubtext: {
        color: '#333',
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 20,
    },

    // ─── Logging Overlay ───
    loggingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 50,
    },
    loggingText: {
        color: '#39FF14',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 3,
        marginTop: 20,
    },
    loggingSubtext: {
        color: '#444',
        fontSize: 11,
        marginTop: 6,
        letterSpacing: 1,
    },

    // ─── AI Insight Modal ───
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.88)',
        justifyContent: 'flex-end',
        padding: 16,
        paddingBottom: 32,
    },
    insightCard: {
        backgroundColor: '#060C12',
        borderWidth: 1.5,
        borderColor: '#39FF14',
        borderRadius: 20,
        padding: 24,
        shadowColor: '#39FF14',
        shadowOpacity: 0.35,
        shadowRadius: 24,
        elevation: 14,
    },
    insightHeaderBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
        gap: 10,
    },
    insightDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#39FF14',
        shadowColor: '#39FF14',
        shadowOpacity: 1,
        shadowRadius: 4,
    },
    insightHeaderText: {
        color: '#39FF14',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 4,
    },
    insightFoodRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    insightFoodName: {
        color: '#EAEAEA',
        fontSize: 18,
        fontWeight: '800',
        flex: 1,
    },
    insightFoodCal: {
        color: '#39FF14',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 1,
    },
    insightMacroRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 16,
        marginBottom: 16,
    },
    insightMacroPill: {
        flexDirection: 'row',
        alignItems: 'baseline',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 3,
    },
    insightMacroVal: {
        fontSize: 16,
        fontWeight: '900',
    },
    insightMacroLabel: {
        color: '#555',
        fontSize: 11,
        fontWeight: '800',
    },
    insightDivider: {
        height: 1,
        backgroundColor: 'rgba(57, 255, 20, 0.15)',
        marginBottom: 16,
    },
    insightFeedback: {
        color: '#CCC',
        fontSize: 14,
        lineHeight: 22,
        fontWeight: '500',
        marginBottom: 24,
        letterSpacing: 0.3,
    },
    insightActions: {
        flexDirection: 'row',
        gap: 12,
    },
    insightBtnSecondary: {
        flex: 1,
        borderWidth: 1.5,
        borderColor: 'rgba(57, 255, 20, 0.3)',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    insightBtnSecondaryText: {
        color: '#39FF14',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
    },
    insightBtnPrimary: {
        flex: 1,
        backgroundColor: '#39FF14',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        shadowColor: '#39FF14',
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 6,
    },
    insightBtnPrimaryText: {
        color: '#000',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
    },

    // ─── Config Modal ───
    configButton: {
        width: 30,
        height: 30,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(57, 255, 20, 0.25)',
        backgroundColor: 'rgba(57, 255, 20, 0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    configButtonText: {
        fontSize: 16,
        color: '#39FF14',
    },
    configCard: {
        backgroundColor: '#060C12',
        borderWidth: 1.5,
        borderColor: '#39FF14',
        borderRadius: 20,
        padding: 24,
        shadowColor: '#39FF14',
        shadowOpacity: 0.35,
        shadowRadius: 24,
        elevation: 14,
    },
    configHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        gap: 10,
    },
    configHeaderText: {
        color: '#39FF14',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 4,
    },
    configDescription: {
        color: '#666',
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 20,
        textAlign: 'center',
    },
    configLabel: {
        color: '#39FF14',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2,
        marginBottom: 8,
    },
    configInput: {
        backgroundColor: '#0A0F14',
        borderWidth: 1,
        borderColor: 'rgba(57, 255, 20, 0.2)',
        borderRadius: 10,
        color: '#FFF',
        fontSize: 14,
        paddingHorizontal: 14,
        paddingVertical: 13,
        fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        marginBottom: 14,
    },
    configStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 20,
        paddingHorizontal: 4,
    },
    configStatusText: {
        color: '#555',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1,
    },
});

export default LogFoodScreen;
