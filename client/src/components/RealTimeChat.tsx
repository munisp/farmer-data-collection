import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Send, 
  Paperclip, 
  Image as ImageIcon, 
  File, 
  Loader2,
  Check,
  CheckCheck,
  MoreVertical
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Message {
  id: number;
  senderId: number;
  senderName: string;
  message: string;
  attachments?: Array<{
    type: string;
    url: string;
    name: string;
  }>;
  timestamp: string;
  read: boolean;
}

interface RealTimeChatProps {
  partnerId: number;
  partnerName: string;
  currentUserId: number;
  messages: Message[];
  onSendMessage: (message: string, attachments?: File[]) => void;
  isTyping?: boolean;
}

export function RealTimeChat({
  partnerId,
  partnerName,
  currentUserId,
  messages,
  onSendMessage,
  isTyping = false,
}: RealTimeChatProps) {
  const [messageText, setMessageText] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!messageText.trim() && attachments.length === 0) return;

    setIsSending(true);
    try {
      await onSendMessage(messageText.trim(), attachments);
      setMessageText("");
      setAttachments([]);
    } catch (error) {
      toast.error("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + attachments.length > 5) {
      toast.error("Maximum 5 files allowed");
      return;
    }
    setAttachments([...attachments, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  return (
    <Card className="flex flex-col h-[600px]">
      {/* Chat Header */}
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>{partnerName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{partnerName}</CardTitle>
              {isTyping && (
                <p className="text-sm text-muted-foreground">typing...</p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      {/* Messages Area */}
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isOwnMessage = msg.senderId === currentUserId;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-2",
                    isOwnMessage ? "justify-end" : "justify-start"
                  )}
                >
                  {!isOwnMessage && (
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-xs">
                        {msg.senderName[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={cn(
                      "max-w-[70%] rounded-lg p-3",
                      isOwnMessage
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {!isOwnMessage && (
                      <p className="text-xs font-semibold mb-1">{msg.senderName}</p>
                    )}
                    
                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>

                    {/* Attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {msg.attachments.map((attachment, idx) => (
                          <a
                            key={idx}
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs hover:underline"
                          >
                            {getFileIcon(attachment.type)}
                            {attachment.name}
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-xs opacity-70">
                        {formatTime(msg.timestamp)}
                      </span>
                      {isOwnMessage && (
                        msg.read ? (
                          <CheckCheck className="w-3 h-3 opacity-70" />
                        ) : (
                          <Check className="w-3 h-3 opacity-70" />
                        )
                      )}
                    </div>
                  </div>

                  {isOwnMessage && (
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-xs">You</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </CardContent>

      {/* Input Area */}
      <div className="border-t p-4">
        {/* Attachment Preview */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((file, idx) => (
              <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                {getFileIcon(file.type)}
                <span className="text-xs">{file.name}</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          <Input
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isSending}
            className="flex-1"
          />

          <Button
            onClick={handleSend}
            disabled={isSending || (!messageText.trim() && attachments.length === 0)}
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </Card>
  );
}
