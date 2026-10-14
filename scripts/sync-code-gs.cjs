const fs = require('fs');
const path = require('path');

const codeGsPath = path.resolve(__dirname, '..', 'Code.gs');
const modalPath = path.resolve(__dirname, '..', 'src', 'components', 'CodeViewerModal.tsx');

const codeGs = fs.readFileSync(codeGsPath, 'utf8');
const modal = fs.readFileSync(modalPath, 'utf8');

const startMarker = 'export const CODE_GS_CONTENT = `';
const endMarkerStr = 'const STANDALONE_HTML_PREVIEW';

const startIndex = modal.indexOf(startMarker);
const previewIndex = modal.indexOf(endMarkerStr);

if (startIndex === -1 || previewIndex === -1) {
  console.error('Markers not found in CodeViewerModal.tsx!');
  process.exit(1);
}

// Find the closing backtick of CODE_GS_CONTENT right before STANDALONE_HTML_PREVIEW
const endIndex = modal.lastIndexOf('`;', previewIndex);
if (endIndex === -1) {
  console.error('Closing backtick not found in CodeViewerModal.tsx!');
  process.exit(1);
}

// Escape ` and ${ in codeGs so it doesn't break template literal
const escapedCodeGs = codeGs.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');

const newModal = modal.slice(0, startIndex + startMarker.length) + escapedCodeGs + modal.slice(endIndex);

fs.writeFileSync(modalPath, newModal, 'utf8');
console.log('Successfully synced Code.gs into CodeViewerModal.tsx!');
