"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  BrowserSpeechRecognition,
  SpeechRecognitionEventLike,
} from "../domain/speech";
import { correctSpeechTranscript } from "./psychiatric-vocabulary";

export interface UseWorkspaceVoiceInputOptions {
  onTranscript: (text: string) => void;
  onListeningFocus?: () => void;
  commandInputRef?: RefObject<HTMLInputElement | null>;
}

export interface WorkspaceVoiceInput {
  voiceSupported: boolean;
  isListening: boolean;
  voiceMessage: string;
  toggleVoice: () => void;
}

/**
 * Web Speech API adapter for the workspace omnibox with psychiatric vocabulary correction.
 */
export function useWorkspaceVoiceInput({
  onTranscript,
  onListeningFocus,
  commandInputRef,
}: UseWorkspaceVoiceInputOptions): WorkspaceVoiceInput {
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    setVoiceSupported(true);
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      const correctedTranscript = correctSpeechTranscript(transcript.trimStart());
      onTranscript(correctedTranscript);
      onListeningFocus?.();
      setVoiceMessage("Listening…");
    };

    recognition.onend = () => {
      setIsListening(false);
      setVoiceMessage("");
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setVoiceMessage(
        event.error === "not-allowed"
          ? "Microphone permission is off"
          : "Voice input unavailable",
      );
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [onTranscript, onListeningFocus]);

  function toggleVoice() {
    const recognition = recognitionRef.current;
    if (!voiceSupported || !recognition) {
      setVoiceMessage("Voice input is not supported in this browser");
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }

    try {
      setVoiceMessage("Listening…");
      onListeningFocus?.();
      commandInputRef?.current?.focus();
      recognition.start();
      setIsListening(true);
    } catch {
      setVoiceMessage("Voice input is already active");
    }
  }

  return {
    voiceSupported,
    isListening,
    voiceMessage,
    toggleVoice,
  };
}
