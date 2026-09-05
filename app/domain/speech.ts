export type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
};

export type SpeechRecognitionEventLike = {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
};

export type SpeechRecognitionErrorLike = {
  readonly error: string;
};

export type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
};

export type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}
