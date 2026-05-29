import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

export default function Messages() {
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");

  const { data: conversations, refetch: refetchConversations } = trpc.marketplace.getConversations.useQuery();
  const { data: messages, refetch: refetchMessages } = trpc.marketplace.getMessages.useQuery(
    { partnerId: selectedPartnerId! },
    { enabled: selectedPartnerId !== null }
  );

  const sendMessageMutation = trpc.marketplace.sendMessage.useMutation({
    onSuccess: () => {
      setMessageText("");
      refetchMessages();
      refetchConversations();
      toast.success("Message sent!");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSendMessage = () => {
    if (!selectedPartnerId || !messageText.trim()) return;
    sendMessageMutation.mutate({
      recipientId: selectedPartnerId,
      message: messageText.trim(),
    });
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Messages</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Conversations List */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!conversations || conversations.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No conversations yet</p>
                </div>
              ) : (
                <div className="divide-y">
                  {conversations.map((conv) => (
                    <button
                      key={conv.partnerId}
                      onClick={() => setSelectedPartnerId(conv.partnerId)}
                      className={`w-full p-4 text-left hover:bg-accent transition-colors ${
                        selectedPartnerId === conv.partnerId ? "bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="font-semibold">User #{conv.partnerId}</span>
                        {conv.unreadCount > 0 && (
                          <Badge variant="default" className="ml-2">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {conv.lastMessage}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(conv.lastMessageAt).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Message Thread */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>
                {selectedPartnerId ? `Conversation with User #${selectedPartnerId}` : "Select a conversation"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedPartnerId ? (
                <div className="text-center text-muted-foreground py-12">
                  <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Select a conversation to view messages</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Messages */}
                  <div className="max-h-96 overflow-y-auto space-y-3 mb-4">
                    {messages && messages.length > 0 ? (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.senderId === selectedPartnerId ? "justify-start" : "justify-end"
                          }`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg p-3 ${
                              msg.senderId === selectedPartnerId
                                ? "bg-muted"
                                : "bg-primary text-primary-foreground"
                            }`}
                          >
                            {msg.subject && (
                              <p className="font-semibold text-sm mb-1">{msg.subject}</p>
                            )}
                            <p className="text-sm">{msg.message}</p>
                            <p className="text-xs opacity-70 mt-1">
                              {new Date(msg.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No messages yet. Start the conversation!
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Send Message Form */}
                  <div className="flex gap-2">
                    <Textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Type your message..."
                      rows={3}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageText.trim() || sendMessageMutation.isPending}
                      size="icon"
                      className="self-end"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
