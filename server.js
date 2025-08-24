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
const GITHUB_API_URL = 'https://api.github.com';

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
    const response = await axios.get(`${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${filePath}`);
    if (response.data.type === 'file' && response.data.size < 100000) { // Limit to 100KB files
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
    const response = await axios.get(`${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${dirPath}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching directory ${dirPath}:`, error.message);
    return [];
  }
}

// Get important source files (not just file names, actual CODE!)
async function getRepositoryCode(owner, repo) {
  try {
    const repoResponse = await axios.get(`${GITHUB_API_URL}/repos/${owner}/${repo}`);
    const repoInfo = repoResponse.data;

    // Get root directory contents
    const rootContents = await getDirectoryContents(owner, repo);
    
    const codeFiles = [];
    const importantFiles = [];

    // Identify important files to analyze
    const codeExtensions = ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php', '.rb', '.swift', '.kt'];
    const configFiles = ['package.json', 'requirements.txt', 'Cargo.toml', 'pom.xml', 'build.gradle', 'Dockerfile'];
    const docFiles = ['README.md', 'CHANGELOG.md'];

    // Function to process files recursively
    async function processDirectory(contents, currentPath = '') {
      for (const item of contents.slice(0, 20)) { // Limit to avoid rate limits
        if (item.type === 'file') {
          const fileName = item.name.toLowerCase();
          const filePath = currentPath ? `${currentPath}/${item.name}` : item.name;
          
          // Get important config and doc files
          if (configFiles.includes(fileName) || docFiles.includes(fileName)) {
            const content = await getFileContent(owner, repo, filePath);
            if (content) {
              importantFiles.push({
                path: filePath,
                name: item.name,
                content: content.substring(0, 5000) // Limit content size
              });
            }
          }
          
          // Get source code files
          if (codeExtensions.some(ext => fileName.endsWith(ext)) && item.size < 50000) {
            const content = await getFileContent(owner, repo, filePath);
            if (content) {
              codeFiles.push({
                path: filePath,
                name: item.name,
                content: content.substring(0, 8000), // Limit for analysis
                language: getLanguageFromExtension(fileName)
              });
            }
          }
        } else if (item.type === 'dir' && !item.name.startsWith('.') && 
                  !['node_modules', 'dist', 'build', 'target', '__pycache__'].includes(item.name)) {
          // Recursively process important directories
          if (['src', 'lib', 'app', 'components', 'utils', 'services', 'controllers', 'models'].includes(item.name.toLowerCase())) {
            const dirContents = await getDirectoryContents(owner, repo, `${currentPath ? currentPath + '/' : ''}${item.name}`);
            await processDirectory(dirContents, `${currentPath ? currentPath + '/' : ''}${item.name}`);
          }
        }
      }
    }

    await processDirectory(rootContents);

    // Prioritize main files
    codeFiles.sort((a, b) => {
      const priority = ['index', 'main', 'app', 'server'];
      const aPriority = priority.findIndex(p => a.name.toLowerCase().includes(p));
      const bPriority = priority.findIndex(p => b.name.toLowerCase().includes(p));
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
      return 0;
    });

    return {
      repoInfo: {
        name: repoInfo.name,
        description: repoInfo.description,
        language: repoInfo.language,
        stars: repoInfo.stargazers_count,
        forks: repoInfo.forks_count
      },
      codeFiles: codeFiles.slice(0, 10), // Top 10 most important files
      importantFiles
    };

  } catch (error) {
    console.error('Error fetching repository code:', error.message);
    throw new Error(`Failed to analyze repository: ${error.message}`);
  }
}

function getLanguageFromExtension(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const langMap = {
    'js': 'JavaScript', 'ts': 'TypeScript', 'tsx': 'TypeScript', 'jsx': 'JavaScript',
    'py': 'Python', 'java': 'Java', 'cpp': 'C++', 'c': 'C', 'go': 'Go',
    'rs': 'Rust', 'php': 'PHP', 'rb': 'Ruby', 'swift': 'Swift', 'kt': 'Kotlin'
  };
  return langMap[ext] || ext.toUpperCase();
}

// Analyze code with Gemini
async function analyzeCodeWithGemini(question, repoData) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  // Build a comprehensive code analysis prompt
  let codeContext = `I'm analyzing the repository: ${repoData.repoInfo.name}
${repoData.repoInfo.description ? `Description: ${repoData.repoInfo.description}` : ''}
Main Language: ${repoData.repoInfo.language}

Here's the actual SOURCE CODE I found:

`;

  // Add code files content
  repoData.codeFiles.forEach((file, index) => {
    codeContext += `=== FILE: ${file.path} (${file.language}) ===
${file.content}

`;
  });

  // Add important config files
  repoData.importantFiles.forEach((file) => {
    codeContext += `=== ${file.name} ===
${file.content.substring(0, 2000)}

`;
  });

  const prompt = `You're a senior developer analyzing this codebase. Answer the user's question by actually looking at the CODE, not just descriptions.

${codeContext}

User Question: ${question}

Analyze the actual code above and provide insights about:
- How the code works internally
- Key functions and their purposes  
- Architecture and design patterns
- Dependencies and how they're used
- Any interesting implementation details

Answer naturally, like you just read through the code:`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000
        }
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Gemini API error:', error.response?.data || error.message);
    throw new Error('Failed to analyze code');
  }
}

app.post('/api/chat', async (req, res) => {
  try {
    const { repoUrl, question } = req.body;

    if (!repoUrl || !question) {
      return res.status(400).json({ error: 'Repository URL and question are required' });
    }

    const repoInfo = extractRepoInfo(repoUrl);
    if (!repoInfo) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL' });
    }

    console.log(`Analyzing CODE in repository: ${repoInfo.owner}/${repoInfo.repo}`);

    // Get actual source code (not just metadata)
    const repoData = await getRepositoryCode(repoInfo.owner, repoInfo.repo);
    
    console.log(`Found ${repoData.codeFiles.length} code files to analyze`);

    // Analyze the actual code
    const answer = await analyzeCodeWithGemini(question, repoData);

    res.json({
      success: true,
      answer,
      filesAnalyzed: repoData.codeFiles.map(f => f.path),
      repoInfo: repoData.repoInfo
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Now analyzing ACTUAL SOURCE CODE, not just README files!');
});