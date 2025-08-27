const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function buildConversationContext(conversationHistory) {
  if (!conversationHistory || conversationHistory.length === 0) return '';
  
  let context = '\nRecent conversation:\n';
  conversationHistory.forEach(msg => {
    if (msg.type === 'user') {
      context += `Human: ${msg.content}\n`;
    } else if (msg.type === 'bot') {
      context += `You: ${msg.content}\n`;
    }
  });
  return context;
}

async function chatWithRepo(question, repoData, conversationHistory = []) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  let codeContext = `Repository: ${repoData.repoInfo.name}
${repoData.repoInfo.description ? `Description: ${repoData.repoInfo.description}` : ''}
Main Language: ${repoData.repoInfo.language}
${repoData.repoInfo.topics && repoData.repoInfo.topics.length > 0 ? `Topics: ${repoData.repoInfo.topics.join(', ')}` : ''}

CODEBASE ANALYSIS:
`;

  // Adding most important files first
  repoData.codeFiles.slice(0, 15).forEach((file) => {
    codeContext += `=== ${file.path} (${file.language}) ===
${file.content}

`;
  });

  // Add config files
  repoData.importantFiles.forEach((file) => {
    codeContext += `=== ${file.name} ===
${file.content.substring(0, 3000)}

`;
  });

  // Add conversation context
  const conversationContext = buildConversationContext(conversationHistory);

  const prompt = `You're a senior developer having a casual conversation with a junior developer about this codebase. Be natural, friendly, and conversational - like you're sitting next to them explaining things.

${codeContext}${conversationContext}

Junior dev asks: "${question}"

Guidelines:
- Talk naturally like a friendly senior dev
- Be VERY concise (1-2 short sentences max)
- Use simple language, avoid jargon
- Reference specific files only when necessary
- If you don't know something, just say so briefly
- Keep it conversational, not formal`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 300,
          topP: 0.8,
          topK: 40
        }
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Gemini API error:', error.response?.data || error.message);
    throw new Error('Failed to chat with repository');
  }
}

module.exports = {
  chatWithRepo,
  buildConversationContext
};