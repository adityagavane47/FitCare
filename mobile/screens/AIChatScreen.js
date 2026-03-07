import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';
import CustomHeader from '../components/CustomHeader';

const SUGGESTIONS = [
    "Best pre-workout meal?",
    "How to lose belly fat?",
    "Leg day routine?",
    "How much protein daily?",
    "Post-workout recovery tips?",
    "Best exercises for beginners?",
];

const AIChatScreen = ({ route }) => {
    const { userId } = route.params;
    const [messages, setMessages] = useState([
        { id: '0', role: 'bot', text: "Hey! I'm your FitCare AI Coach 🤖💪\n\nAsk me anything about:\n• Workouts & exercises\n• Diet & nutrition\n• Recovery & wellness\n\nLet's get started!" }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [aiStatus, setAiStatus] = useState('checking'); // 'checking', 'online', 'offline'
    const flatListRef = useRef(null);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fitcareAPI.getTrainerStatus();
                setAiStatus(res.status === 'online' ? 'online' : 'offline');
            } catch (err) {
                setAiStatus('offline');
            }
        };
        checkStatus();
        // optionally poll every 30s
        const interval = setInterval(checkStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const sendMessage = async (text) => {
        const userMsg = text || input.trim();
        if (!userMsg || loading) return;

        const userEntry = { id: Date.now().toString(), role: 'user', text: userMsg };
        setMessages(prev => [...prev, userEntry]);
        setInput('');
        setLoading(true);

        try {
            const res = await fitcareAPI.chatWithTrainer(userId, userMsg);
            const botEntry = { id: (Date.now() + 1).toString(), role: 'bot', text: res.reply };
            setMessages(prev => [...prev, botEntry]);
        } catch (err) {
            const errorEntry = {
                id: (Date.now() + 1).toString(), role: 'bot',
                text: "Couldn't reach the AI Coach right now. Please make sure the backend server is running and try again."
            };
            setMessages(prev => [...prev, errorEntry]);
        } finally {
            setLoading(false);
        }
    };

    const renderMessage = ({ item }) => {
        const isUser = item.role === 'user';
        return (
            <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
                {!isUser && <Text style={styles.botLabel}>🤖 AI Coach</Text>}
                <Text style={[styles.messageText, isUser && styles.userMessageText]}>{item.text}</Text>
            </View>
        );
    };

    const showSuggestions = messages.length <= 1 && !loading;

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <CustomHeader title="AI Coach" />
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <Text style={styles.headerTitle}>System Intelligence</Text>
                    <View style={styles.statusBadge}>
                        <View style={[styles.statusDot, aiStatus === 'online' ? styles.dotOnline : aiStatus === 'offline' ? styles.dotOffline : styles.dotChecking]} />
                        <Text style={styles.statusText}>
                            {aiStatus === 'online' ? 'Phi-3 Online' : aiStatus === 'offline' ? 'Offline (Run Ollama)' : 'Checking...'}
                        </Text>
                    </View>
                </View>
                <Text style={styles.headerSub}>Active Protocol Assistant</Text>
            </View>

            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.chatArea}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                ListFooterComponent={
                    loading ? (
                        <View style={[styles.bubble, styles.botBubble]}>
                            <Text style={styles.botLabel}>🤖 AI Coach</Text>
                            <View style={styles.typingRow}>
                                <ActivityIndicator size="small" color={Colors.primary} />
                                <Text style={styles.typingText}>Thinking...</Text>
                            </View>
                        </View>
                    ) : null
                }
            />

            {showSuggestions && (
                <View style={styles.suggestionsContainer}>
                    <Text style={styles.suggestionsTitle}>Try asking:</Text>
                    <View style={styles.suggestionsRow}>
                        {SUGGESTIONS.map((s, i) => (
                            <TouchableOpacity key={i} style={styles.chip} onPress={() => sendMessage(s)}>
                                <Text style={styles.chipText}>{s}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            <View style={styles.inputBar}>
                <TextInput
                    style={styles.textInput}
                    placeholder="Ask about diet or workouts..."
                    placeholderTextColor={Colors.textDim}
                    value={input}
                    onChangeText={setInput}
                    onSubmitEditing={() => sendMessage()}
                    returnKeyType="send"
                    editable={!loading}
                    multiline
                />
                <TouchableOpacity
                    style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
                    onPress={() => sendMessage()}
                    disabled={!input.trim() || loading}
                >
                    <Text style={styles.sendBtnText}>➤</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        paddingTop: 50,
        paddingBottom: 14,
        paddingHorizontal: 20,
        backgroundColor: '#0A0A0A',
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: Colors.primary,
        letterSpacing: 1,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#111',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#333',
    },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    dotOnline: { backgroundColor: Colors.primary, shadowColor: Colors.primary, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
    dotOffline: { backgroundColor: Colors.danger },
    dotChecking: { backgroundColor: Colors.warning },
    statusText: { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },
    headerSub: {
        fontSize: 12,
        color: Colors.textMuted,
        marginTop: 2,
    },
    chatArea: {
        padding: 16,
        paddingBottom: 8,
    },
    bubble: {
        maxWidth: '82%',
        padding: 14,
        borderRadius: 16,
        marginBottom: 10,
    },
    userBubble: {
        backgroundColor: Colors.primary,
        alignSelf: 'flex-end',
        borderBottomRightRadius: 4,
    },
    botBubble: {
        backgroundColor: '#111111',
        alignSelf: 'flex-start',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    botLabel: {
        fontSize: 11,
        color: Colors.primary,
        fontWeight: '700',
        marginBottom: 6,
    },
    messageText: {
        color: Colors.text,
        fontSize: 14,
        lineHeight: 20,
    },
    userMessageText: {
        color: '#000000',
        fontWeight: '600',
    },
    typingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    typingText: {
        color: Colors.textMuted,
        fontSize: 13,
        fontStyle: 'italic',
    },
    suggestionsContainer: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    suggestionsTitle: {
        color: Colors.textMuted,
        fontSize: 12,
        marginBottom: 8,
        fontWeight: '600',
    },
    suggestionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        backgroundColor: 'rgba(0, 255, 0, 0.08)',
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    chipText: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600',
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#0A0A0A',
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    textInput: {
        flex: 1,
        backgroundColor: '#111111',
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 24,
        paddingHorizontal: 18,
        paddingVertical: 12,
        color: Colors.text,
        fontSize: 15,
        maxHeight: 100,
    },
    sendBtn: {
        marginLeft: 10,
        backgroundColor: Colors.primary,
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendBtnDisabled: {
        opacity: 0.3,
    },
    sendBtnText: {
        fontSize: 20,
        color: '#000',
        fontWeight: '800',
    },
});

export default AIChatScreen;
