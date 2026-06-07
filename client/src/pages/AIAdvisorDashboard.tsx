import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

type Message = {
  role: "user" | "assistant";
  content: string;
  queryType?: string;
  confidence?: number;
  suggestions?: string[];
  sources?: string[];
};

export default function AIAdvisorDashboard() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I'm your AI farming advisor. I can help you with crop diseases, soil management, planting guides, pest control, market prices, and weather-based recommendations.\n\nI speak 14 languages including Kiswahili, Hausa, Yoruba, Hindi, and more. What can I help you with today?", queryType: "general", confidence: 1.0, suggestions: ["What's wrong with my maize?", "When should I plant beans?", "Interpret my soil test results"] },
  ]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("en");

  const languages = [
    { code: "en", name: "English" }, { code: "sw", name: "Kiswahili" },
    { code: "ha", name: "Hausa" }, { code: "yo", name: "Yoruba" },
    { code: "am", name: "Amharic" }, { code: "fr", name: "Français" },
    { code: "hi", name: "Hindi" }, { code: "bn", name: "Bengali" },
    { code: "ta", name: "Tamil" }, { code: "th", name: "Thai" },
    { code: "vi", name: "Tiếng Việt" }, { code: "es", name: "Español" },
    { code: "pt", name: "Português" }, { code: "tl", name: "Tagalog" },
  ];

  const sendMessage = () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");

    // Simulate AI response (in production, calls /api/v1/chat via tRPC)
    setTimeout(() => {
      const response: Message = {
        role: "assistant",
        content: "I'm processing your question through the agricultural knowledge base. In production, this connects to the Agri-LLM service (RAG pipeline with Ollama + crop knowledge + disease database).\n\nPlease ensure the agri-llm service is running on port 8103.",
        queryType: "general",
        confidence: 0.85,
        suggestions: ["Ask about a specific crop", "Send a photo for diagnosis", "Check soil recommendations"],
        sources: ["FAO Crop Guide", "CGIAR Disease Database"],
      };
      setMessages([...newMessages, response]);
    }, 500);
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">🤖 AI Farming Advisor</h1>
            <p className="text-sm text-gray-600">Farmer.Chat — RAG-powered agricultural advisory in {languages.length} languages</p>
          </div>
          <div className="flex items-center gap-4">
            <select value={language} onChange={e => setLanguage(e.target.value)} className="border rounded px-2 py-1 text-sm">
              {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            <Link href="/"><a className="text-blue-600">← Dashboard</a></Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="cursor-pointer hover:shadow-md"><CardContent className="pt-4 text-center text-sm"><div className="text-2xl mb-1">🌿</div>Crop Disease</CardContent></Card>
          <Card className="cursor-pointer hover:shadow-md"><CardContent className="pt-4 text-center text-sm"><div className="text-2xl mb-1">🧪</div>Soil Advice</CardContent></Card>
          <Card className="cursor-pointer hover:shadow-md"><CardContent className="pt-4 text-center text-sm"><div className="text-2xl mb-1">🌱</div>Planting Guide</CardContent></Card>
          <Card className="cursor-pointer hover:shadow-md"><CardContent className="pt-4 text-center text-sm"><div className="text-2xl mb-1">💰</div>Market Prices</CardContent></Card>
        </div>

        {/* Chat Messages */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 ${msg.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100"}`}>
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    {msg.confidence && msg.role === "assistant" && (
                      <p className="text-xs mt-2 opacity-70">Confidence: {(msg.confidence * 100).toFixed(0)}% | Type: {msg.queryType}</p>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <p className="text-xs mt-1 opacity-60">Sources: {msg.sources.join(", ")}</p>
                    )}
                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {msg.suggestions.map((s, j) => (
                          <button key={j} onClick={() => { setInput(s); }} className="text-xs bg-white/20 border border-current/20 rounded-full px-2 py-0.5 hover:bg-white/30">{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="Ask about crops, soil, pests, weather, or prices..."
            className="flex-1 border rounded-lg px-4 py-2"
          />
          <button onClick={sendMessage} className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Send</button>
        </div>

        {/* Delivery Channels */}
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-lg">Available Channels</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-center">
              <div className="border rounded p-3">📱 Mobile App</div>
              <div className="border rounded p-3">💬 WhatsApp</div>
              <div className="border rounded p-3">📞 USSD</div>
              <div className="border rounded p-3">🎙️ Voice/IVR</div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
