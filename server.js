const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'build')));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API_URL = 'https://api.github.com';

// In-memory storage for analyzed repositories (in production, use Redis or database)
const repoCache = new Map();

function extractRepoInfo(url) {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return { 
      owner: match[1], 
      repo: match[2].replace(/\.git$/, '').replace(/\/$/, '') 
    };
  }
  return null;
}

// Function to get file content from GitHub
async function getFileContent(owner, repo, filePath) {
  try {
    const headers = {};
    if (GITHUB_TOKEN) {
      headers.Authorization = `token ${GITHUB_TOKEN}`;
    }
    
    const response = await axios.get(`${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${filePath}`, { headers });
    if (response.data.type === 'file' && response.data.size < 200000) { // 200KB limit
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return content;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching file ${filePath}:`, error.message);
    return null;
  }
}

// Recursively get directory contents
async function getDirectoryContents(owner, repo, dirPath = '') {
  try {
    const headers = {};
    if (GITHUB_TOKEN) {
      headers.Authorization = `token ${GITHUB_TOKEN}`;
    }
    
    const response = await axios.get(`${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${dirPath}`, { headers });
    return response.data;
  } catch (error) {
    console.error(`Error fetching directory ${dirPath}:`, error.message);
    return [];
  }
}

// Get comprehensive repository analysis
async function getRepositoryCode(owner, repo) {
  try {
    const repoResponse = await axios.get(`${GITHUB_API_URL}/repos/${owner}/${repo}`);
    const repoInfo = repoResponse.data;

    const rootContents = await getDirectoryContents(owner, repo);
    
    const codeFiles = [];
    const importantFiles = [];

    const codeExtensions = ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.vue', '.svelte'];
    const configFiles = ['package.json', 'requirements.txt', 'Cargo.toml', 'pom.xml', 'build.gradle', 'Dockerfile', 'docker-compose.yml', '.env.example'];
    const docFiles = ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'docs.md'];

    async function processDirectory(contents, currentPath = '', depth = 0) {
      if (depth > 3) return; // Limit recursion depth
      
      for (const item of contents.slice(0, 60)) {
        if (item.type === 'file') {
          const fileName = item.name.toLowerCase();
          const filePath = currentPath ? `${currentPath}/${item.name}` : item.name;
          
          // Important config and doc files
          if (configFiles.includes(fileName) || docFiles.includes(fileName)) {
            const content = await getFileContent(owner, repo, filePath);
            if (content) {
              importantFiles.push({
                path: filePath,
                name: item.name,
                content: content.substring(0, 8000),
                type: 'config'
              });
            }
          }
          
          // Source code files
          if (codeExtensions.some(ext => fileName.endsWith(ext)) && item.size < 300000) {
            const content = await getFileContent(owner, repo, filePath);
            if (content) {
              codeFiles.push({
                path: filePath,
                name: item.name,
                content: content.substring(0, 20000),
                language: getLanguageFromExtension(fileName),
                size: item.size
              });
            }
          }
        } else if (item.type === 'dir' && !item.name.startsWith('.') && 
                  !['node_modules', 'dist', 'build', 'target', '__pycache__', 'vendor', '.git'].includes(item.name)) {
          
          const importantDirs = ['src', 'lib', 'app', 'components', 'utils', 'services', 'controllers', 'models', 'routes', 'middleware', 'config'];
          if (importantDirs.includes(item.name.toLowerCase()) || depth === 0) {
            const dirContents = await getDirectoryContents(owner, repo, `${currentPath ? currentPath + '/' : ''}${item.name}`);
            await processDirectory(dirContents, `${currentPath ? currentPath + '/' : ''}${item.name}`, depth + 1);
          }
        }
      }
    }

    await processDirectory(rootContents);

    // Sort files by importance
    codeFiles.sort((a, b) => {
      const priority = ['index', 'main', 'app', 'server', 'router'];
      const aPriority = priority.findIndex(p => a.name.toLowerCase().includes(p));
      const bPriority = priority.findIndex(p => b.name.toLowerCase().includes(p));
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
      return a.size - b.size; // Smaller files first for remaining
    });

    return {
      repoInfo: {
        name: repoInfo.name,
        description: repoInfo.description,
        language: repoInfo.language,
        stars: repoInfo.stargazers_count,
        forks: repoInfo.forks_count,
        topics: repoInfo.topics,
        homepage: repoInfo.homepage
      },
      codeFiles: codeFiles.slice(0, 25),
      importantFiles,
      totalFiles: codeFiles.length + importantFiles.length
    };

  } catch (error) {
    console.error('Error fetching repository:', error.message);
    throw new Error(`Failed to analyze repository: ${error.message}`);
  }
}

function getLanguageFromExtension(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const langMap = {
    'js': 'JavaScript', 'ts': 'TypeScript', 'tsx': 'TypeScript', 'jsx': 'JavaScript',
    'py': 'Python', 'java': 'Java', 'cpp': 'C++', 'c': 'C', 'go': 'Go',
    'rs': 'Rust', 'php': 'PHP', 'rb': 'Ruby', 'swift': 'Swift', 'kt': 'Kotlin',
    'vue': 'Vue', 'svelte': 'Svelte'
  };
  return langMap[ext] || ext.toUpperCase();
}

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

// Chat with repository using conversation context
async function chatWithRepo(question, repoData, conversationHistory = []) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  // Build comprehensive context
  let codeContext = `Repository: ${repoData.repoInfo.name}
${repoData.repoInfo.description ? `Description: ${repoData.repoInfo.description}` : ''}
Main Language: ${repoData.repoInfo.language}
${repoData.repoInfo.topics && repoData.repoInfo.topics.length > 0 ? `Topics: ${repoData.repoInfo.topics.join(', ')}` : ''}

CODEBASE ANALYSIS:
`;

  // Add most important files first
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
          maxOutputTokens: 300, // Much shorter responses
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

// Repository analysis endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { repoUrl } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }

    const repoInfo = extractRepoInfo(repoUrl);
    if (!repoInfo) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL' });
    }

    const cacheKey = `${repoInfo.owner}/${repoInfo.repo}`;
    
    // Check cache first
    if (repoCache.has(cacheKey)) {
      const cachedData = repoCache.get(cacheKey);
      console.log(`Using cached analysis for ${cacheKey}`);
      return res.json({
        success: true,
        repoInfo: cachedData.repoInfo,
        filesAnalyzed: cachedData.totalFiles
      });
    }

    console.log(`Analyzing repository: ${cacheKey}`);

    const repoData = await getRepositoryCode(repoInfo.owner, repoInfo.repo);
    
    // Cache the analysis
    repoCache.set(cacheKey, repoData);
    
    console.log(`Analysis complete: ${repoData.totalFiles} files processed`);

    res.json({
      success: true,
      repoInfo: repoData.repoInfo,
      filesAnalyzed: repoData.totalFiles
    });

  } catch (error) {
    console.error('Analysis error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { repoUrl, question, conversationHistory } = req.body;

    if (!repoUrl || !question) {
      return res.status(400).json({ error: 'Repository URL and question are required' });
    }

    const repoInfo = extractRepoInfo(repoUrl);
    if (!repoInfo) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL' });
    }

    const cacheKey = `${repoInfo.owner}/${repoInfo.repo}`;
    
    // Get repo data from cache or analyze fresh
    let repoData = repoCache.get(cacheKey);
    if (!repoData) {
      console.log(`Repository not in cache, analyzing: ${cacheKey}`);
      repoData = await getRepositoryCode(repoInfo.owner, repoInfo.repo);
      repoCache.set(cacheKey, repoData);
    }

    const answer = await chatWithRepo(question, repoData, conversationHistory);

    res.json({
      success: true,
      answer
    });

  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cacheSize: repoCache.size
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('📊 Enhanced chat interface with conversation history');
  console.log('🧠 Using 1M context window for better understanding');
});