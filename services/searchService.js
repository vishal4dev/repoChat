// Code search functionality
function searchInFiles(repoData, query) {
  if (!query || query.trim().length < 2) {
    return { results: [], totalMatches: 0 };
  }

  const searchQuery = query.toLowerCase().trim();
  const results = [];
  let totalMatches = 0;

  // Search through all files (code + config)
  const allFiles = [...repoData.codeFiles, ...repoData.importantFiles];

  allFiles.forEach(file => {
    const content = file.fullContent || file.content;
    const lines = content.split('\n');
    const matches = [];

    lines.forEach((line, lineIndex) => {
      const lowerLine = line.toLowerCase();
      
      // Check if line contains the search query
      if (lowerLine.includes(searchQuery)) {
        const startIndex = Math.max(0, lowerLine.indexOf(searchQuery));
        
        matches.push({
          lineNumber: lineIndex + 1,
          line: line.trim(),
          context: getContextLines(lines, lineIndex, 2), // 2 lines above/below
          matchStart: startIndex,
          matchLength: searchQuery.length
        });
        totalMatches++;
      }
    });

    if (matches.length > 0) {
      results.push({
        file: {
          path: file.path,
          name: file.name,
          language: file.language || 'text',
          size: file.size
        },
        matches: matches.slice(0, 5), // Limit to 5 matches per file
        totalMatches: matches.length
      });
    }
  });

  // Sort results by relevance (more matches first, then by file importance)
  results.sort((a, b) => {
    const aImportant = isImportantFile(a.file.name);
    const bImportant = isImportantFile(b.file.name);
    
    if (aImportant && !bImportant) return -1;
    if (!aImportant && bImportant) return 1;
    
    return b.totalMatches - a.totalMatches;
  });

  return {
    results: results.slice(0, 10), // Limit to 10 files
    totalMatches,
    query: searchQuery
  };
}

// Get context lines around a match
function getContextLines(lines, centerIndex, contextSize = 2) {
  const start = Math.max(0, centerIndex - contextSize);
  const end = Math.min(lines.length, centerIndex + contextSize + 1);
  
  return lines.slice(start, end).map((line, index) => ({
    lineNumber: start + index + 1,
    content: line,
    isMatch: start + index === centerIndex
  }));
}

// Check if file is considered important (main files, configs)
function isImportantFile(fileName) {
  const importantFiles = [
    'index.js', 'main.js', 'app.js', 'server.js', 
    'package.json', 'readme.md', 'config.js'
  ];
  return importantFiles.some(important => 
    fileName.toLowerCase().includes(important.toLowerCase())
  );
}

// Search for specific patterns (functions, classes, etc.)
function searchPatterns(repoData, query) {
  const patterns = {
    function: /(?:function\s+|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>\s*|function)|\w+\s*\([^)]*\)\s*{)/gi,
    class: /class\s+\w+/gi,
    import: /(?:import|require)\s*.*?['"`]/gi,
    export: /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+\w+/gi
  };

  const results = [];
  const allFiles = [...repoData.codeFiles, ...repoData.importantFiles];

  allFiles.forEach(file => {
    const content = file.fullContent || file.content;
    
    Object.entries(patterns).forEach(([patternName, pattern]) => {
      const matches = [...content.matchAll(pattern)];
      
      matches.forEach(match => {
        const matchText = match[0];
        if (matchText.toLowerCase().includes(query.toLowerCase())) {
          const lines = content.substring(0, match.index).split('\n');
          const lineNumber = lines.length;
          
          results.push({
            file: {
              path: file.path,
              name: file.name,
              language: file.language || 'text'
            },
            match: {
              type: patternName,
              text: matchText.trim(),
              lineNumber,
              context: content.split('\n')[lineNumber - 1]?.trim()
            }
          });
        }
      });
    });
  });

  return results.slice(0, 15); // Limit results
}

module.exports = {
  searchInFiles,
  searchPatterns,
  getContextLines,
  isImportantFile
};