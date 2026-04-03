/**
 * Workaround for Next.js 16 Turbopack NFT bug.
 * Turbopack doesn't generate middleware.js.nft.json but Vercel expects it.
 * This script creates a minimal NFT file after build completes.
 * See: https://github.com/vercel/next.js/discussions/91609
 */
const fs = require('fs');
const path = require('path');

const nextDir = path.join(process.cwd(), '.next');
const serverDir = path.join(nextDir, 'server');
const nftFile = path.join(serverDir, 'middleware.js.nft.json');

// Only create if it doesn't exist (Vercel CI)
if (!fs.existsSync(nftFile)) {
  console.log('Creating missing middleware.js.nft.json...');
  
  // Ensure server directory exists
  if (!fs.existsSync(serverDir)) {
    fs.mkdirSync(serverDir, { recursive: true });
  }

  // Create minimal NFT (Node File Trace) JSON
  const nftContent = JSON.stringify({
    version: 1,
    files: []
  }, null, 2);

  fs.writeFileSync(nftFile, nftContent);
  console.log('Created middleware.js.nft.json successfully');
} else {
  console.log('middleware.js.nft.json already exists');
}
