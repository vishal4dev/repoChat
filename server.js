const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// services
const { extractRepoInfo, getRepositoryCode } = require('./services/githubService');
const { chatWithRepo } = require('./services/aiService');
const { searchInFiles, searchPatterns } = require('./services/searchService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'build')));

// local memory storage for analyzed repositories
const repoCache = new Map();

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
    console.error('❌ Analysis error:', error.message);
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
    
    // Get repo data from cache 
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

// Code search endpoint
app.post('/api/search', async (req, res) => {
  try {
    const { repoUrl, query, type = 'content' } = req.body;

    if (!repoUrl || !query) {
      return res.status(400).json({ error: 'Repository URL and search query are required' });
    }

    const repoInfo = extractRepoInfo(repoUrl);
    if (!repoInfo) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL' });
    }

    const cacheKey = `${repoInfo.owner}/${repoInfo.repo}`;
    const repoData = repoCache.get(cacheKey);
    
    if (!repoData) {
      return res.status(400).json({ error: 'Repository not analyzed yet. Please analyze first.' });
    }

    console.log(`Searching in ${cacheKey} for: "${query}"`);

    let searchResults;
    if (type === 'patterns') {
      searchResults = searchPatterns(repoData, query);
    } else {
      searchResults = searchInFiles(repoData, query);
    }

    console.log(`Found ${searchResults.totalMatches || searchResults.length} matches`);

    res.json({
      success: true,
      ...searchResults,
      repoName: repoData.repoInfo.name
    });

  } catch (error) {
    console.error('🔍 Search error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get file content endpoint
app.post('/api/file', async (req, res) => {
  try {
    const { repoUrl, filePath } = req.body;

    if (!repoUrl || !filePath) {
      return res.status(400).json({ error: 'Repository URL and file path are required' });
    }

    const repoInfo = extractRepoInfo(repoUrl);
    if (!repoInfo) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL' });
    }

    const cacheKey = `${repoInfo.owner}/${repoInfo.repo}`;
    const repoData = repoCache.get(cacheKey);
    
    if (!repoData) {
      return res.status(400).json({ error: 'Repository not analyzed yet' });
    }

    // Find file in cached data
    const file = repoData.allFiles.find(f => f.path === filePath);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      success: true,
      file: {
        path: file.path,
        name: file.name,
        language: file.language,
        content: file.fullContent || file.content,
        size: file.size
      }
    });

  } catch (error) {
    console.error('📄 File error:', error.message);
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
  console.log(`Server running on port ${PORT}`);
  console.log('Enhanced chat interface with code search');
  console.log('Modular architecture with separate services');
  console.log('Search functionality: /api/search');
});