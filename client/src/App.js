import React, { useState } from "react";
import {
  Send,
  Github,
  MessageSquare,
  Loader2,
  ExternalLink,
} from "lucide-react";

export default function GitHubRepoChat() {
  const [repoUrl, setRepoUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const validateGitHubUrl = (url) => {
    const githubRegex = /^https:\/\/github\.com\/[^\/]+\/[^\/]+\/?$/;
    return githubRegex.test(url);
  };

  const extractRepoInfo = (url) => {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!repoUrl.trim() || !question.trim()) {
      setError("Please provide both a repository URL and a question");
      return;
    }

    if (!validateGitHubUrl(repoUrl)) {
      setError("Please enter a valid GitHub repository URL");
      return;
    }

    setError("");
    setIsLoading(true);
    setAnswer("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          question: question.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      setAnswer(data.answer);
    } catch (err) {
      setError(
        err.message || "Failed to analyze the repository. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const clearAll = () => {
    setRepoUrl("");
    setQuestion("");
    setAnswer("");
    setError("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-white/10 rounded-full backdrop-blur-sm">
              <Github className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white">RepoChat</h1>
          </div>
          <p className="text-gray-300 text-lg max-w-2xl mx-auto">
            Chat with any GitHub repository in natural language. Just paste the
            repo URL and ask questions!
          </p>
        </div>

        {/* Main Form */}
        <div className="max-w-4xl mx-auto">
          <div className="space-y-6">
            {/* Repository URL Input */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <label
                htmlFor="repo-url"
                className="block text-white font-medium mb-3 flex items-center gap-2"
              >
                <Github className="w-5 h-5" />
                GitHub Repository URL
              </label>
              <div className="relative">
                <input
                  id="repo-url"
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/username/repository"
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
                {repoUrl && validateGitHubUrl(repoUrl) && (
                  <ExternalLink className="absolute right-3 top-3.5 w-5 h-5 text-green-400" />
                )}
              </div>
            </div>

            {/* Question Input */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <label
                htmlFor="question"
                className="block text-white font-medium mb-3 flex items-center gap-2"
              >
                <MessageSquare className="w-5 h-5" />
                Your Question
              </label>
              <textarea
                id="question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="What does this repository do? How is the project structured? What are the main components?"
                rows={4}
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-6 rounded-xl font-medium hover:from-purple-700 hover:to-blue-700 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Ask Question
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={clearAll}
                className="px-6 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-all duration-200 backdrop-blur-sm"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Answer Section */}
          {answer && (
            <div className="mt-8 bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Answer
              </h3>
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {answer}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-16">
          <p className="text-gray-400 text-sm">
            Built for quick repository exploration and understanding
          </p>
        </div>
      </div>
    </div>
  );
}
