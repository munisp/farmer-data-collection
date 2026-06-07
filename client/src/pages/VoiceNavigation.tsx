import { trpc } from "@/lib/trpc";
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Volume2, Languages, ArrowRight, Home, ShoppingCart, MapPin, Cloud, DollarSign, Tractor } from "lucide-react";

const VOICE_URL = import.meta.env.VITE_VOICE_SERVICE_URL || "http://localhost:8109";

const QUICK_COMMANDS = [
  { icon: Home, label: "Dashboard", cmd: "dashboard" },
  { icon: ShoppingCart, label: "Marketplace", cmd: "marketplace" },
  { icon: MapPin, label: "My Farms", cmd: "my_farms" },
  { icon: Cloud, label: "Weather", cmd: "weather" },
  { icon: DollarSign, label: "Prices", cmd: "prices" },
  { icon: Tractor, label: "Sell", cmd: "sell" },
];

interface VoiceResult {
  matched: boolean;
  command: string | null;
  route: string | null;
  label: string | null;
  confidence: number;
  response_text: string;
  suggestions?: string[];
}

export default function VoiceNavigation() {
  const [language, setLanguage] = useState("en");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [history, setHistory] = useState<Array<{ input: string; result: VoiceResult }>>([]);

  const processCommand = useCallback(async (text: string) => {
    try {
      const resp = await fetch(`${VOICE_URL}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language }),
      });
      if (resp.ok) {
        const data: VoiceResult = await resp.json();
        setResult(data);
        setHistory((prev) => [{ input: text, result: data }, ...prev.slice(0, 9)]);
        if (data.matched && data.route) {
          // Navigate after a short delay to show the result
          setTimeout(() => {
            window.location.href = data.route!;
          }, 1500);
        }
      }
    } catch (err) {
      console.warn('[VoiceNav] Voice service error:', String(err));
      setResult({
        matched: false,
        command: null,
        route: null,
        label: null,
        confidence: 0,
        response_text: "Voice service unavailable. Please try again.",
      });
    }
  }, [language]);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setResult({
        matched: false,
        command: null,
        route: null,
        label: null,
        confidence: 0,
        response_text: "Speech recognition not supported in this browser. Use Chrome or Edge.",
      });
      return;
    }

    const recognition = new (SpeechRecognition as { new(): { lang: string; interimResults: boolean; maxAlternatives: number; onresult: (event: { results: { transcript: string }[][] }) => void; onerror: () => void; onend: () => void; start: () => void } })();
    recognition.lang = language === "yo" ? "yo-NG" : language === "ha" ? "ha-NG" : language === "ig" ? "ig-NG" : "en-NG";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      processCommand(text);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    setListening(true);
    recognition.start();
  }, [language, processCommand]);

  const languageNames: Record<string, string> = {
    en: "English",
    yo: "Yoruba",
    ha: "Hausa",
    ig: "Igbo",
  };

  return (
    <div className="p-4 md:p-6 space-y-6 dark:bg-slate-900 min-h-screen" role="main" aria-label="Voice Navigation">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Voice Navigation</h1>
        <p className="text-gray-500 dark:text-gray-400">Navigate FarmConnect using your voice in English, Yoruba, Hausa, or Igbo</p>
      </div>

      {/* Language Selector */}
      <div className="flex justify-center">
        <Select value={language} onValueChange={setLanguage} aria-label="Select language">
          <SelectTrigger className="w-48 dark:bg-slate-800 dark:text-white dark:border-slate-700">
            <Languages className="h-4 w-4 mr-2" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(languageNames).map(([code, name]) => (
              <SelectItem key={code} value={code}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Main Voice Button */}
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={startListening}
          disabled={listening}
          className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
            listening
              ? "bg-red-500 animate-pulse scale-110"
              : "bg-green-600 hover:bg-green-700 hover:scale-105"
          } text-white shadow-lg`}
          aria-label={listening ? "Listening for voice command" : "Start voice command"}
        >
          {listening ? (
            <MicOff className="h-16 w-16" aria-hidden="true" />
          ) : (
            <Mic className="h-16 w-16" aria-hidden="true" />
          )}
        </button>
        <p className="text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
          {listening ? "Listening... Speak now" : "Tap the microphone to speak"}
        </p>
      </div>

      {/* Transcript & Result */}
      {(transcript || result) && (
        <Card className="max-w-lg mx-auto dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4 space-y-3">
            {transcript && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">You said:</p>
                <p className="text-lg font-medium dark:text-white">&ldquo;{transcript}&rdquo;</p>
              </div>
            )}
            {result && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="h-4 w-4 text-blue-500" aria-hidden="true" />
                  <p className="text-sm dark:text-gray-300">{result.response_text}</p>
                </div>
                {result.matched && (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      {Math.round(result.confidence * 100)}% match
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    <span className="font-medium dark:text-white">{result.label}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Command Buttons */}
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="text-center dark:text-white">Quick Commands</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {QUICK_COMMANDS.map(({ icon: Icon, label, cmd }) => (
              <button
                key={cmd}
                onClick={() => {
                  setTranscript(cmd);
                  processCommand(cmd);
                }}
                className="flex flex-col items-center gap-2 p-4 rounded-lg bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                aria-label={`Navigate to ${label}`}
              >
                <Icon className="h-8 w-8 text-green-600 dark:text-green-400" aria-hidden="true" />
                <span className="text-sm font-medium dark:text-white">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="dark:text-white">Command History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2" role="list" aria-label="Voice command history">
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-slate-700" role="listitem">
                  <span className="text-sm dark:text-gray-300">&ldquo;{h.input}&rdquo;</span>
                  {h.result.matched ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">{h.result.label}</Badge>
                  ) : (
                    <Badge variant="secondary">No match</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
