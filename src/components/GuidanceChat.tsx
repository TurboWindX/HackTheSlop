import React, { useState, useRef, useEffect } from 'react';
import { AIMessage, Engagement } from '../types';
import { aiService } from '../services/aiService';
import { braveSearch, formatResultsForPrompt } from '../services/webSearchService';
import { pentestPhases } from '../data/phases';

interface GuidanceChatProps {
    engagement: Engagement | null;
    bloodhoundJson?: string;
}

// ── Lightweight Markdown renderer ────────────────────────────────────────────
// Handles: fenced code blocks, **bold**, `inline code`, plain paragraphs.
function renderMarkdown(text: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    // Split on fenced code blocks: ```lang\n...\n```
    const fenceRe = /```([\w+-]*)\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = fenceRe.exec(text)) !== null) {
        // text before the code block
        if (match.index > lastIndex) {
            nodes.push(renderInline(text.slice(lastIndex, match.index), nodes.length));
        }
        const lang = match[1] || 'bash';
        const code = match[2].replace(/\n$/, '');
        nodes.push(
            <div key={`cb-${nodes.length}`} className="md-code-block">
                <div className="md-code-lang">{lang}</div>
                <pre className="md-pre"><code>{code}</code></pre>
            </div>
        );
        lastIndex = fenceRe.lastIndex;
    }
    // remaining text
    if (lastIndex < text.length) {
        nodes.push(renderInline(text.slice(lastIndex), nodes.length));
    }
    return nodes;
}

function renderInline(text: string, key: number): React.ReactNode {
    // Split on **bold** and `inline code`
    const parts: React.ReactNode[] = [];
    const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) parts.push(text.slice(last, m.index));
        if (m[1] !== undefined) parts.push(<strong key={m.index}>{m[1]}</strong>);
        else if (m[2] !== undefined) parts.push(<code key={m.index} className="md-inline-code">{m[2]}</code>);
        last = re.lastIndex;
    }
    if (last < text.length) parts.push(text.slice(last));
    // Wrap in paragraphs split by double newlines
    const joined = parts.reduce<React.ReactNode[]>((acc, part) => {
        if (typeof part === 'string') {
            // preserve single newlines as <br>
            const lines = part.split('\n');
            lines.forEach((line, i) => {
                acc.push(line);
                if (i < lines.length - 1) acc.push(<br key={`br-${key}-${i}`} />);
            });
        } else {
            acc.push(part);
        }
        return acc;
    }, []);
    return <p key={key} className="md-para">{joined}</p>;
}

interface GuidanceChatProps {
    engagement: Engagement | null;
    bloodhoundJson?: string;
}

const CHAT_STORAGE_KEY = 'turbohax_chat_history';
const PHASE_STORAGE_KEY = 'turbohax_chat_phase';

const GuidanceChat: React.FC<GuidanceChatProps> = ({ engagement, bloodhoundJson }) => {
    const [messages, setMessages] = useState<AIMessage[]>(() => {
        try {
            const saved = localStorage.getItem(CHAT_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [input, setInput]                 = useState('');
    const [selectedPhase, setSelectedPhase] = useState(() => localStorage.getItem(PHASE_STORAGE_KEY) ?? '');
    const [loading, setLoading]             = useState(false);
    const [webSearch, setWebSearch]         = useState(false);
    const [searching, setSearching]         = useState(false);
    const [error, setError]                 = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Persist messages whenever they change
    useEffect(() => {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    }, [messages]);

    // Persist selected phase
    useEffect(() => {
        localStorage.setItem(PHASE_STORAGE_KEY, selectedPhase);
    }, [selectedPhase]);

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

            let finalMessage = userText;
            if (webSearch) {
                setSearching(true);
                try {
                    const results = await braveSearch(userText);
                    if (results.length) {
                        finalMessage = formatResultsForPrompt(results) + userText;
                    }
                } catch {
                    // Search failed — continue without results
                } finally {
                    setSearching(false);
                }
            }

            const reply = await aiService.getGuidance({
                engagement,
                phase: phase?.name,
                userMessage: finalMessage,
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
                {messages.length > 0 && (
                    <div className="chat-clear-row">
                        <button className="chat-clear-btn" onClick={() => setMessages([])}>🗑 Clear chat</button>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-message ${msg.role}`}>
                        <span className="role-label">{msg.role === 'user' ? 'You' : '🧙 Sherpa'}</span>
                        {msg.role === 'assistant'
                            ? <div className="message-content md-content">{renderMarkdown(msg.content)}</div>
                            : <pre className="message-content">{msg.content}</pre>
                        }
                    </div>
                ))}
                {loading && (
                    <div className="chat-message assistant loading">
                        <span className="role-label">🧙 Sherpa</span>
                        <span className="dots">{searching ? 'Searching web…' : 'Thinking…'}</span>
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
                <div className="chat-input-actions">
                    <button
                        className={`btn-web-search ${webSearch ? 'active' : ''}`}
                        onClick={() => setWebSearch(v => !v)}
                        title={webSearch ? 'Web search ON — results will be injected as context' : 'Web search OFF'}
                        disabled={loading}
                    >
                        🔍
                    </button>
                    <button
                        className="btn-primary send-btn"
                        onClick={() => sendMessage()}
                        disabled={loading || !input.trim()}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GuidanceChat;
