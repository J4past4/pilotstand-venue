import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentAudioPayload } from '../agent/types';

export type VoiceMode = 'speech-api' | 'recorder' | 'unsupported';

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const MAX_RECORDING_SECONDS = 30;

export interface UseVoiceInputOptions {
  onTranscriptReady: (transcript: string) => void;
  onAudioClipReady: (audio: AgentAudioPayload) => void;
  onError?: (message: string) => void;
}

export function useVoiceInput({
  onTranscriptReady,
  onAudioClipReady,
  onError,
}: UseVoiceInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);

  const hasSpeechApi = Boolean(getSpeechRecognitionCtor());
  const hasRecorder =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined';

  // Prefer free browser Web Speech API when available; fall back to Push-to-Talk MediaRecorder
  const [preferredMode, setPreferredMode] = useState<'auto' | 'recorder'>('auto');
  const effectiveMode: VoiceMode =
    preferredMode === 'recorder' && hasRecorder
      ? 'recorder'
      : hasSpeechApi
        ? 'speech-api'
        : hasRecorder
          ? 'recorder'
          : 'unsupported';

  const speechRef = useRef<BrowserSpeechRecognition | null>(null);
  const finalTranscriptRef = useRef('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    clearTimer();
    if (speechRef.current) {
      try {
        speechRef.current.stop();
      } catch {
        // ignore if already stopped
      }
      speechRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, [clearTimer]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    if (effectiveMode === 'unsupported') {
      onError?.('Voice input is not supported in this browser.');
      return;
    }

    setElapsedSec(0);
    setInterimTranscript('');
    finalTranscriptRef.current = '';
    startTimeRef.current = Date.now();

    if (effectiveMode === 'speech-api') {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return;
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onresult = (event) => {
        let interim = '';
        let finalText = finalTranscriptRef.current;
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) {
            finalText = `${finalText} ${text}`.trim();
          } else {
            interim += text;
          }
        }
        finalTranscriptRef.current = finalText;
        setInterimTranscript(`${finalText} ${interim}`.trim());
      };

      recognition.onerror = (ev) => {
        if (ev.error === 'not-allowed') {
          onError?.('Microphone permission denied. Please allow mic access in your browser.');
        } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
          // If browser speech recognition fails (e.g., network/Brave), switch to recorder if available
          if (hasRecorder) {
            setPreferredMode('recorder');
            onError?.('Browser speech service unavailable — switched to Push-to-Talk audio mode. Tap mic again.');
          } else {
            onError?.(`Voice recognition error: ${ev.error || 'unknown'}`);
          }
        }
        clearTimer();
        setIsRecording(false);
      };

      recognition.onend = () => {
        clearTimer();
        setIsRecording(false);
        const text = finalTranscriptRef.current.trim();
        setInterimTranscript('');
        if (text) {
          onTranscriptReady(text);
        }
      };

      speechRef.current = recognition;
      setIsRecording(true);
      recognition.start();

      timerRef.current = window.setInterval(() => {
        const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSec(sec);
        if (sec >= MAX_RECORDING_SECONDS) {
          stopRecording();
        }
      }, 250);
      return;
    }

    // Fallback: Push-to-Talk MediaRecorder (capped at 30s)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 32_000, // ~120 KB per 30s — ultra-low bandwidth & token cost
      });
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const durationSec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: mimeType.split(';')[0] });
        if (blob.size < 400) return;

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
          if (base64) {
            onAudioClipReady({
              base64,
              mimeType: mimeType.split(';')[0],
              durationSec,
            });
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recorder.start();

      timerRef.current = window.setInterval(() => {
        const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSec(sec);
        if (sec >= MAX_RECORDING_SECONDS) {
          stopRecording();
        }
      }, 250);
    } catch {
      onError?.('Could not access microphone. Please check browser permissions.');
      setIsRecording(false);
    }
  }, [
    isRecording,
    effectiveMode,
    hasRecorder,
    onError,
    onTranscriptReady,
    onAudioClipReady,
    clearTimer,
    stopRecording,
  ]);

  useEffect(() => {
    return () => {
      clearTimer();
      speechRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [clearTimer]);

  return {
    isRecording,
    interimTranscript,
    elapsedSec,
    maxSeconds: MAX_RECORDING_SECONDS,
    voiceMode: effectiveMode,
    startRecording,
    stopRecording,
  };
}
