import React, { useState, useRef, useEffect } from 'react';
import { AIMessage, Engagement } from '../types';
import { aiService } from '../services/aiService';
import { pentestPhases } from '../data/phases';

interface GuidanceChatProps {
    engagement: Engagement;
    bloodhoundJson?: string;
}

const GuidanceChat: React.FC<GuidanceChatProps> = ({ engagement, bloodhoundJson }) => {
    const [messages, setMessages]           = useState<AIMessage[]>([]);
    const [input, setInput]                 = useState('');
    const [selectedPhase, setSelectedPhase] = useState('');
    const [loading, setLoading]             = useState(false);
    const [error, setError]                 = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async (overrideMessage?: string) => {
        const userText = overrideMessage ?? input.trim();
        if (!userText) return;

        const userMsg: AIMessage = { role: 'user', content: userText };
        const updatedHistory = [...messages, userMsg];
        setMessages(updatedHistory);
        setInput('');
        setLoading(true);
        setError(null);

        try {
            const phase = pentestPhases.find(p => p.id === selectedPhase);
            const reply = await aiService.getGuidance({
                engagement,
                phase: phase?.name,
                userMessage: userText,
                conversationHistory: messages,
            });

            setMessages([...updatedHistory, { role: 'assistant', content: reply }]);
        } catch (err: any) {
            setError(err.message ?? 'Failed to reach LM Studio. Is it running?');
        } finally {
            setLoading(false);
        }
    };

    const handlePhasePrompt = (phaseId: string) => {
        const phase = pentestPhases.find(p => p.id === phaseId);
        if (!phase) return;
        setSelectedPhase(phaseId);
        sendMessage(`I'm starting the "${phase.name}" phase. ${phase.promptHint} What should I do first? Required tools: ${phase.tools.join(', ')}.`);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="guidance-chat">
            <div className="phase-selector">
                <span>Jump to phase:</span>
                {pentestPhases.map(phase => (
                    <button
                        key={phase.id}
                        className={`phase-btn ${selectedPhase === phase.id ? 'active' : ''}`}
                        onClick={() => handlePhasePrompt(phase.id)}
                        disabled={loading}
                    >
                        {phase.name}
                    </button>
                ))}
            </div>

            <div className="chat-window">
                {messages.length === 0 && (
                    <div className="chat-placeholder">
                        <p>Select a phase above to get guided, or type a question below.</p>
                        <p>Example: <em>"What should I run first to enumerate AD users?"</em></p>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-message ${msg.role}`}>
                        <span className="role-label">{msg.role === 'user' ? 'You' : 'AI'}</span>
                        <pre className="message-content">{msg.content}</pre>
                    </div>
                ))}
                {loading && (
                    <div className="chat-message assistant loading">
                        <span className="role-label">AI</span>
                        <span className="dots">Thinking…</span>
                    </div>
                )}
                {error && (
                    <div className="chat-error">
                        Error: {error}
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            <div className="chat-input-row">
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything about the engagement… (Enter to send, Shift+Enter for newline)"
                    rows={3}
                    disabled={loading}
                />
                <button
                    className="btn-primary send-btn"
                    onClick={() => sendMessage()}
                    disabled={loading || !input.trim()}
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default GuidanceChat;
