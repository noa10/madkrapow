/**
 * Workaround for Next.js 16 Turbopack middleware output bug.
 * Turbopack outputs middleware as edge chunks but Vercel expects .next/server/middleware.js
 * This script creates the missing middleware.js file after build completes.
 * See: https://github.com/vercel/next.js/issues/91600
 */
const fs = require('fs');
const path = require('path');

const nextDir = path.join(process.cwd(), '.next');
const serverDir = path.join(nextDir, 'server');
const nftFile = path.join(serverDir, 'middleware.js.nft.json');
const middlewareFile = path.join(serverDir, 'middleware.js');

// Ensure server directory exists
if (!fs.existsSync(serverDir)) {
  fs.mkdirSync(serverDir, { recursive: true });
}

// Create middleware.js.nft.json if missing
if (!fs.existsSync(nftFile)) {
  console.log('Creating missing middleware.js.nft.json...');
  const nftContent = JSON.stringify({
    version: 1,
    files: []
  }, null, 2);
  fs.writeFileSync(nftFile, nftContent);
  console.log('Created middleware.js.nft.json successfully');
} else {
  console.log('middleware.js.nft.json already exists');
}

// Create middleware.js if missing (Vercel expects this file)
if (!fs.existsSync(middlewareFile)) {
  console.log('Creating missing middleware.js...');
  
  // Find the edge wrapper chunk
  const edgeChunksDir = path.join(serverDir, 'edge', 'chunks');
  if (fs.existsSync(edgeChunksDir)) {
    const chunks = fs.readdirSync(edgeChunksDir);
    const wrapperChunk = chunks.find(f => f.includes('edge-wrapper') && f.endsWith('.js'));
    
    if (wrapperChunk) {
      // Create a middleware.js that loads the edge chunk
      const middlewareContent = `// Auto-generated middleware entry point for Vercel compatibility
const chunk = require('./edge/chunks/${wrapperChunk}');
module.exports = chunk;
`;
      fs.writeFileSync(middlewareFile, middlewareContent);
      console.log(`Created middleware.js referencing edge/chunks/${wrapperChunk}`);
    } else {
      // Fallback: create a minimal middleware.js
      const middlewareContent = `// Auto-generated middleware entry point for Vercel compatibility
module.exports = {};
`;
      fs.writeFileSync(middlewareFile, middlewareContent);
      console.log('Created minimal middleware.js (no edge wrapper found)');
    }
  } else {
    // No edge chunks directory - create minimal middleware
    const middlewareContent = `// Auto-generated middleware entry point for Vercel compatibility
module.exports = {};
`;
    fs.writeFileSync(middlewareFile, middlewareContent);
    console.log('Created minimal middleware.js (no edge chunks directory)');
  }
} else {
  console.log('middleware.js already exists');
}
