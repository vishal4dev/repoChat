import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Github,
  MessageSquare,
  Loader2,
  ExternalLink,
  Bot,
  User,
  Trash2,
  Settings,
  CheckCircle
} from "lucide-react";

export default function GitHubRepoChat() {
  const [repoUrl, setRepoUrl] = useState("");
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [repoAnalyzed, setRepoAnalyzed] = useState(false);
  const [repoInfo, setRepoInfo] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const validateGitHubUrl = (url) => {
    const githubRegex = /^https:\/\/github\.com\/[^\/]+\/[^\/]+\/?$/;
    return githubRegex.test(url);
  };

  const analyzeRepo = async () => {
    if (!repoUrl.trim()) {
      setError("Please provide a repository URL");
      return;
    }

    if (!validateGitHubUrl(repoUrl)) {
      setError("Please enter a valid GitHub repository URL");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze repository");
      }

      setRepoAnalyzed(true);
      setRepoInfo(data.repoInfo);
      
      // Add welcome message
      const welcomeMessage = {
        id: Date.now(),
        type: 'bot',
        content: `Hey! I've analyzed the **${data.repoInfo.name}** repository. ${data.repoInfo.description ? `It's ${data.repoInfo.description.toLowerCase()}. ` : ''}I've gone through ${data.filesAnalyzed} files and I'm ready to chat about the codebase. What would you like to know?`,
        timestamp: new Date()
      };
      
      setMessages([welcomeMessage]);
    } catch (err) {
      setError(err.message || "Failed to analyze the repository. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!currentMessage.trim() || !repoAnalyzed) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: currentMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          question: userMessage.content,
          conversationHistory: messages.slice(-10) // Send last 10 messages for context
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: data.answer,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: `Sorry, I ran into an issue: ${err.message}. Can you try asking that again?`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setCurrentMessage("");
    setRepoAnalyzed(false);
    setRepoInfo(null);
    setError("");
  };

  const resetAll = () => {
    clearChat();
    setRepoUrl("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (repoAnalyzed) {
        sendMessage();
      } else {
        analyzeRepo();
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-white/10 rounded-full backdrop-blur-sm">
              <Github className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white">RepoChat</h1>
          </div>
          <p className="text-gray-300 text-lg max-w-2xl mx-auto">
            Have a natural conversation with any GitHub repository
          </p>
        </div>

        {/* Repository Setup */}
        {!repoAnalyzed && (
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 mb-6">
            <label className="block text-white font-medium mb-3 flex items-center gap-2">
              <Github className="w-5 h-5" />
              GitHub Repository URL
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="https://github.com/username/repository"
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
                {repoUrl && validateGitHubUrl(repoUrl) && (
                  <CheckCircle className="absolute right-3 top-3.5 w-5 h-5 text-green-400" />
                )}
              </div>
              <button
                onClick={analyzeRepo}
                disabled={isLoading || !repoUrl}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-blue-700 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Let's Chat"
                )}
              </button>
            </div>
            {error && (
              <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Repository Info Bar */}
        {repoAnalyzed && repoInfo && (
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Github className="w-5 h-5 text-purple-400" />
              <div>
                <h3 className="text-white font-medium">{repoInfo.name}</h3>
                <p className="text-gray-400 text-sm">{repoInfo.language} • {repoInfo.stars} stars</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearChat}
                className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={resetAll}
                className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
                title="Change repository"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Chat Interface */}
        {repoAnalyzed && (
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
            {/* Messages */}
            <div className="h-96 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.type === 'bot' && (
                    <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-purple-300" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] px-4 py-3 rounded-2xl ${
                      message.type === 'user'
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                        : 'bg-white/10 text-gray-200'
                    }`}
                  >
                    <div className="text-sm leading-relaxed">
                      {message.content.split('\n').map((line, i) => (
                        <p key={i} className="mb-1 last:mb-0">
                          {line.split('**').map((part, j) => 
                            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                          )}
                        </p>
                      ))}
                    </div>
                  </div>
                  {message.type === 'user' && (
                    <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-4 h-4 text-blue-300" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-purple-300" />
                  </div>
                  <div className="bg-white/10 px-4 py-3 rounded-2xl">
                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything about the codebase..."
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !currentMessage.trim()}
                  className="px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-blue-700 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {repoAnalyzed && messages.length === 1 && (
          <div className="mt-6 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <p className="text-gray-300 text-sm mb-3">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {[
                "What does this code do?",
                "How is the project structured?",
                "What are the main components?",
                "How do I get started?",
                "What libraries does it use?"
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentMessage(suggestion)}
                  className="px-3 py-2 bg-white/10 text-gray-300 rounded-lg text-sm hover:bg-white/20 transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}