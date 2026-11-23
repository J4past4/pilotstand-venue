import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  Mic,
  Send,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { fetchAgentStatus, type AgentServerStatus } from '../agent/agentClient';
import type { AgentAudioPayload, AgentChatMessage } from '../agent/types';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface AgentDrawerProps {
  open: boolean;
  onClose: () => void;
  messages: AgentChatMessage[];
  isLoading: boolean;
  canUndo: boolean;
  onSendText: (text: string, viaVoice?: boolean) => Promise<void>;
  onSendAudio: (audio: AgentAudioPayload) => Promise<void>;
  onUndoLastTurn: () => void;
  onClearChat: () => void;
}

const STARTER_PROMPTS = [
  'Build a 6×4m island stand with an LED video wall, lounge sofa & reception counter',
  'Switch to the dark Obsidian & Brass luxury palette with keynote spotlighting',
  'Add a meeting table with chairs on the left and a planter box at the front corner',
  'Set brand name to "APEX ROBOTICS" and switch to visitor eye-level view',
];

const MAX_PROMPT_CHARS = 1000;

export const AgentDrawer: React.FC<AgentDrawerProps> = ({
  open,
  onClose,
  messages,
  isLoading,
  canUndo,
  onSendText,
  onSendAudio,
  onUndoLastTurn,
  onClearChat,
}) => {
  const [input, setInput] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<AgentServerStatus | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const voice = useVoiceInput({
    onTranscriptReady: (transcript) => {
      setVoiceError(null);
      void onSendText(transcript, true);
    },
    onAudioClipReady: (audio) => {
      setVoiceError(null);
      void onSendAudio(audio);
    },
    onError: (msg) => setVoiceError(msg),
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
      if (!serverStatus) {
        void fetchAgentStatus().then(setServerStatus);
      }
    }
  }, [open, serverStatus]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, voice.interimTranscript]);

  if (!open) return null;

  const latestMeta = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.meta)?.meta;

  const statusLabel = latestMeta
    ? latestMeta.provider === 'local-preview'
      ? 'Local Preview · Zero-cost rule engine'
      : `${latestMeta.provider.toUpperCase()} · ${latestMeta.model}${
          latestMeta.remainingHourly !== undefined
            ? ` · ${latestMeta.remainingHourly} left/hr`
            : ''
        }`
    : serverStatus?.configured && serverStatus.provider
      ? `${serverStatus.provider.toUpperCase()} · ${serverStatus.model || 'Ready'} · Connected`
      : serverStatus
        ? 'Local Preview · Add GEMINI_API_KEY on Vercel for live AI'
        : 'Chat or speak to build & refine your 3D stand';

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    setVoiceError(null);
    await onSendText(trimmed, false);
  };

  const handleToggleVoice = () => {
    setVoiceError(null);
    if (voice.isRecording) {
      voice.stopRecording();
    } else {
      void voice.startRecording();
    }
  };

  return (
    <aside
      className="agent-drawer"
      id="ai-agent-drawer"
      aria-label="AI Stand Designer chat and voice assistant"
    >
      <div className="agent-drawer-header">
        <div className="agent-header-title">
          <div className="agent-spark-badge" aria-hidden="true">
            <Sparkles size={14} />
          </div>
          <div>
            <h3>AI Stand Designer</h3>
            <span className="agent-subtitle">{statusLabel}</span>
          </div>
        </div>

        <div className="agent-header-actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="icon-btn"
              onClick={onClearChat}
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title="Close AI Designer"
            aria-label="Close AI Designer"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="agent-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="agent-empty-state">
            <p className="agent-empty-lead">
              Describe your booth size, brand style, or equipment — by typing or tapping the mic.
              Every AI update is a single Undo step.
            </p>
            <div className="agent-starter-list">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="agent-starter-chip"
                  disabled={isLoading}
                  onClick={() => void onSendText(prompt, false)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isLastAssistant =
              msg.role === 'assistant' && idx === messages.length - 1;
            return (
              <div key={msg.id} className={`agent-msg agent-msg-${msg.role}`}>
                <div className="agent-msg-bubble">
                  {msg.viaVoice && (
                    <span className="agent-voice-tag">
                      <Mic size={10} /> Voice
                    </span>
                  )}
                  <p className="agent-msg-text">{msg.content}</p>

                  {msg.appliedSummaries && msg.appliedSummaries.length > 0 && (
                    <div className="agent-action-chips">
                      {msg.appliedSummaries.map((sum, i) => (
                        <span key={`${msg.id}-s-${i}`} className="agent-action-chip">
                          {sum}
                        </span>
                      ))}
                    </div>
                  )}

                  {msg.warnings && msg.warnings.length > 0 && (
                    <div className="agent-warning-list">
                      {msg.warnings.map((w, i) => (
                        <span key={`${msg.id}-w-${i}`} className="agent-warning-item">
                          <AlertCircle size={11} /> {w}
                        </span>
                      ))}
                    </div>
                  )}

                  {isLastAssistant && msg.canUndo && canUndo && (
                    <button
                      type="button"
                      className="agent-undo-inline"
                      onClick={onUndoLastTurn}
                    >
                      <Undo2 size={12} />
                      <span>Undo AI changes</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {voice.isRecording && (
          <div className="agent-recording-banner">
            <span className="agent-rec-dot" />
            <div className="agent-rec-copy">
              <strong>
                {voice.voiceMode === 'speech-api' ? 'Listening...' : 'Recording voice clip...'}
              </strong>
              <span className="mono-num">
                {voice.elapsedSec}s / {voice.maxSeconds}s
              </span>
              {voice.interimTranscript && (
                <p className="agent-interim-text">“{voice.interimTranscript}”</p>
              )}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="agent-msg agent-msg-assistant">
            <div className="agent-msg-bubble agent-thinking">
              <Loader2 size={14} className="agent-spin" />
              <span>Designing stand layout…</span>
            </div>
          </div>
        )}
      </div>

      {voiceError && (
        <div className="agent-error-banner">
          <AlertCircle size={13} />
          <span>{voiceError}</span>
        </div>
      )}

      <form className="agent-composer" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          id="agent-prompt-input"
          className="agent-textarea"
          rows={2}
          maxLength={MAX_PROMPT_CHARS}
          placeholder="Ask to build or edit your stand… (e.g. 'Add an oak reception desk up front')"
          value={input}
          disabled={isLoading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
        />

        <div className="agent-composer-bar">
          <span className="agent-char-count mono-num">
            {input.length}/{MAX_PROMPT_CHARS}
          </span>

          <div className="agent-composer-btns">
            {voice.voiceMode !== 'unsupported' && (
              <button
                type="button"
                id="agent-voice-btn"
                className={`agent-mic-btn ${voice.isRecording ? 'recording' : ''}`}
                disabled={isLoading}
                onClick={handleToggleVoice}
                title={
                  voice.isRecording
                    ? 'Stop voice input & send'
                    : voice.voiceMode === 'speech-api'
                      ? 'Speak prompt (free browser dictation)'
                      : 'Push-to-Talk voice clip (max 30s)'
                }
                aria-label={voice.isRecording ? 'Stop recording' : 'Start voice input'}
              >
                {voice.isRecording ? <Square size={13} /> : <Mic size={14} />}
                <span>{voice.isRecording ? 'Stop' : 'Voice'}</span>
              </button>
            )}

            <button
              type="submit"
              id="agent-send-btn"
              className="primary-btn agent-send-btn"
              disabled={isLoading || !input.trim()}
            >
              <Send size={13} />
              <span>Send</span>
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
};
