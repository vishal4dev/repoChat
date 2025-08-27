const axios = require('axios');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
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

function getAuthHeaders() {
  const headers = {};
  if (GITHUB_TOKEN) {
    headers.Authorization = `token ${GITHUB_TOKEN}`;
  }
  return { headers };
}

async function getFileContent(owner, repo, filePath) {
  try {
    const response = await axios.get(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${filePath}`, 
      getAuthHeaders()
    );
    
    if (response.data.type === 'file' && response.data.size < 200000) {
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return content;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching file ${filePath}:`, error.message);
    return null;
  }
}

async function getDirectoryContents(owner, repo, dirPath = '') {
  try {
    const response = await axios.get(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${dirPath}`, 
      getAuthHeaders()
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching directory ${dirPath}:`, error.message);
    return [];
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

async function getRepositoryCode(owner, repo) {
  try {
    const repoResponse = await axios.get(`${GITHUB_API_URL}/repos/${owner}/${repo}`, getAuthHeaders());
    const repoInfo = repoResponse.data;

    const rootContents = await getDirectoryContents(owner, repo);
    
    const codeFiles = [];
    const importantFiles = [];

    const codeExtensions = ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.vue', '.svelte'];
    const configFiles = ['package.json', 'requirements.txt', 'Cargo.toml', 'pom.xml', 'build.gradle', 'Dockerfile', 'docker-compose.yml', '.env.example'];
    const docFiles = ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'docs.md'];

    async function processDirectory(contents, currentPath = '', depth = 0) {
      if (depth > 3) return;
      
      for (const item of contents.slice(0, 60)) {
        if (item.type === 'file') {
          const fileName = item.name.toLowerCase();
          const filePath = currentPath ? `${currentPath}/${item.name}` : item.name;
          
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
          
          if (codeExtensions.some(ext => fileName.endsWith(ext)) && item.size < 300000) {
            const content = await getFileContent(owner, repo, filePath);
            if (content) {
              codeFiles.push({
                path: filePath,
                name: item.name,
                content: content.substring(0, 20000),
                language: getLanguageFromExtension(fileName),
                size: item.size,
                fullContent: content // Store full content for search
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

    // Sorting files by importance
    codeFiles.sort((a, b) => {
      const priority = ['index', 'main', 'app', 'server', 'router'];
      const aPriority = priority.findIndex(p => a.name.toLowerCase().includes(p));
      const bPriority = priority.findIndex(p => b.name.toLowerCase().includes(p));
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
      return a.size - b.size;
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
      totalFiles: codeFiles.length + importantFiles.length,
      allFiles: [...codeFiles, ...importantFiles] // For search functionality
    };

  } catch (error) {
    console.error('Error fetching repository:', error.message);
    throw new Error(`Failed to analyze repository: ${error.message}`);
  }
}

module.exports = {
  extractRepoInfo,
  getFileContent,
  getDirectoryContents,
  getRepositoryCode,
  getLanguageFromExtension
};