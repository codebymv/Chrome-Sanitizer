// File Sanitizer - Core Functionality Only

const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const mainContainer = document.getElementById('mainContainer');
const originalPreview = document.getElementById('originalPreview');
const sanitizedPreview = document.getElementById('sanitizedPreview');
const downloadBtn = document.getElementById('downloadBtn');
const resetSelectionsBtn = document.getElementById('resetSelectionsBtn');
const clearFileBtn = document.getElementById('clearFileBtn');
const autoCleanBtn = document.getElementById('autoCleanBtn');
const manualCleanBtn = document.getElementById('manualCleanBtn');
const autoModeRadios = document.querySelectorAll('input[name="autoMode"]');
const manualModeRadios = document.querySelectorAll('input[name="manualMode"]');

let currentFile = null;
let currentFileContent = null;
let currentFileName = '';
let sanitizedContent = null;
let detectedPII = [];
let fileType = '';
let activeField = null;
let lastAutoSelected = null;
let lastManualSelected = null;

// PII Detection Patterns
const piiPatterns = {
  ssn: { 
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, 
    type: 'SSN'
  },
  email: { 
    pattern: /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}\b/g, 
    type: 'Email'
  },
  phone: { 
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, 
    type: 'Phone'
  },
  creditCard: { 
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, 
    type: 'Credit Card'
  },
  zipCode: { 
    pattern: /\b\d{5}(?:[-\s]?\d{4})?\b/g, 
    type: 'ZIP Code'
  },
  ipAddress: { 
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, 
    type: 'IP Address'
  },
  dob: { 
    pattern: /\b(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:\d{2}|\d{4})\b/g, 
    type: 'Date of Birth'
  },
  address: { 
    pattern: /\b\d+\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Circle|Cir|Place|Pl)\b/gi, 
    type: 'Street Address'
  }
};

// Upload handlers
uploadZone.addEventListener('click', () => {
  console.log('Upload zone clicked');
  fileInput.click();
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  console.log('File dropped:', file);
  if (file) processFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  console.log('File selected:', file);
  if (file) processFile(file);
});

// Reset button
resetSelectionsBtn.addEventListener('click', () => {
  console.log('Reset clicked - no selections to clear in simplified version');
});

// Clear file button
clearFileBtn.addEventListener('click', () => {
  if (confirm('⚠️ Clear the current file and start over?')) {
    clearEverything();
  }
});

// Auto mode radios
autoModeRadios.forEach(radio => {
  radio.addEventListener('click', (e) => {
    if (lastAutoSelected === e.target && e.target.checked) {
      e.target.checked = false;
      lastAutoSelected = null;
      manualModeRadios.forEach(r => r.disabled = false);
      autoCleanBtn.disabled = true;
      activeField = null;
      return;
    }
    
    lastAutoSelected = e.target;
    activeField = 'auto';
    autoCleanBtn.disabled = false;
    
    manualModeRadios.forEach(r => {
      r.checked = false;
      r.disabled = true;
    });
    manualCleanBtn.disabled = true;
    lastManualSelected = null;
  });
});

// Manual mode radios (disabled for now)
manualModeRadios.forEach(radio => {
  radio.addEventListener('click', (e) => {
    alert('Manual mode coming soon! Please use Auto mode for now.');
    e.target.checked = false;
  });
});

// Auto Clean button
autoCleanBtn.addEventListener('click', () => {
  console.log('Auto Clean clicked');
  const selectedMode = document.querySelector('input[name="autoMode"]:checked')?.value;
  console.log('Selected mode:', selectedMode);
  
  if (selectedMode && currentFileContent) {
    performAutoClean(selectedMode);
  } else {
    alert('Please select Hide or Replace mode first.');
  }
});

// Manual Clean button (disabled for now)
manualCleanBtn.addEventListener('click', () => {
  alert('Manual mode coming soon!');
});

// Download button
downloadBtn.addEventListener('click', () => {
  downloadSanitizedFile();
});

function clearEverything() {
  currentFile = null;
  currentFileContent = null;
  currentFileName = '';
  sanitizedContent = null;
  detectedPII = [];
  fileType = '';
  
  autoModeRadios.forEach(r => {
    r.disabled = false;
    r.checked = false;
  });
  manualModeRadios.forEach(r => {
    r.disabled = false;
    r.checked = false;
  });
  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;
  activeField = null;
  lastAutoSelected = null;
  lastManualSelected = null;
  
  mainContainer.classList.remove('active');
  uploadZone.classList.remove('hidden');
  fileInput.value = '';
  
  console.log('Everything cleared');
}

function processFile(file) {
  console.log('Processing file:', file.name, 'Size:', file.size, 'Type:', file.type);
  
  if (file.size > 10 * 1024 * 1024) {
    alert('File too large. Maximum size is 10MB.');
    return;
  }

  currentFile = file;
  currentFileName = file.name;
  const fileName = file.name.toLowerCase();
  const mimeType = file.type;

  // Reset state
  autoModeRadios.forEach(r => {
    r.disabled = false;
    r.checked = false;
  });
  manualModeRadios.forEach(r => {
    r.disabled = false;
    r.checked = false;
  });
  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;
  sanitizedContent = null;

  // Detect file type
  if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName)) {
    fileType = 'image';
    displayImage(file);
  } else if (fileName.endsWith('.csv')) {
    fileType = 'csv';
    displayCSV(file);
  } else {
    // Treat everything else as text
    fileType = 'text';
    displayTextFile(file);
  }
}

function displayTextFile(file) {
  console.log('Displaying text file...');
  const reader = new FileReader();
  
  reader.onload = (e) => {
    currentFileContent = e.target.result;
    console.log('Text loaded. Length:', currentFileContent.length);
    console.log('First 200 chars:', currentFileContent.substring(0, 200));
    
    detectPII(currentFileContent);
    
    originalPreview.innerHTML = `<pre>${escapeHtml(currentFileContent)}</pre>`;
    sanitizedPreview.innerHTML = '<pre style="color: #6366f1; text-align: center; padding: 40px;">⚡ CLICK CLEAN TO SANITIZE ⚡</pre>';
    
    showPreview();
  };
  
  reader.onerror = (e) => {
    console.error('Error reading file:', e);
    alert('Error reading file. Please try again.');
  };
  
  reader.readAsText(file);
}

function displayCSV(file) {
  console.log('Displaying CSV file...');
  const reader = new FileReader();
  
  reader.onload = (e) => {
    currentFileContent = e.target.result;
    console.log('CSV loaded. Length:', currentFileContent.length);
    
    detectPII(currentFileContent);
    
    const tableHTML = csvToTable(currentFileContent);
    originalPreview.innerHTML = tableHTML;
    sanitizedPreview.innerHTML = '<p style="color: #6366f1; text-align: center; padding: 40px;">⚡ CLICK CLEAN TO SANITIZE ⚡</p>';
    
    showPreview();
  };
  
  reader.onerror = (e) => {
    console.error('Error reading CSV:', e);
    alert('Error reading CSV file. Please try again.');
  };
  
  reader.readAsText(file);
}

function displayImage(file) {
  console.log('Displaying image...');
  const reader = new FileReader();
  
  reader.onload = (e) => {
    currentFileContent = e.target.result;
    originalPreview.innerHTML = `<img src="${e.target.result}" alt="Original">`;
    sanitizedPreview.innerHTML = `<img src="${e.target.result}" alt="Sanitized">`;
    
    showPreview();
  };
  
  reader.onerror = (e) => {
    console.error('Error reading image:', e);
    alert('Error reading image. Please try again.');
  };
  
  reader.readAsDataURL(file);
}

function csvToTable(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return '<pre>Empty file</pre>';

  const rows = lines.map(line => {
    const cells = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.trim());
    return cells;
  });

  let html = '<table>';
  if (rows.length > 0) {
    html += '<thead><tr>';
    rows[0].forEach(cell => {
      html += `<th>${escapeHtml(cell)}</th>`;
    });
    html += '</tr></thead>';
  }

  if (rows.length > 1) {
    html += '<tbody>';
    for (let i = 1; i < rows.length; i++) {
      html += '<tr>';
      rows[i].forEach(cell => {
        html += `<td>${escapeHtml(cell)}</td>`;
      });
      html += '</tr>';
    }
    html += '</tbody>';
  }

  html += '</table>';
  return html;
}

function detectPII(text) {
  detectedPII = [];
  
  console.log('Detecting PII in text of length:', text.length);
  
  for (const [key, { pattern, type }] of Object.entries(piiPatterns)) {
    pattern.lastIndex = 0;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      detectedPII.push({
        type,
        value: match[0],
        index: match.index,
        length: match[0].length,
        key
      });
      console.log(`Found ${type}:`, match[0]);
    }
  }
  
  console.log(`Total PII detected: ${detectedPII.length}`);
}

function performAutoClean(mode) {
  console.log('performAutoClean:', mode, 'fileType:', fileType);
  
  if (!currentFileContent) {
    alert('No file content available.');
    return;
  }

  if (fileType === 'image') {
    alert('Auto-clean is only for text/CSV files. Use Manual mode for images.');
    return;
  }

  if (fileType === 'text') {
    detectPII(currentFileContent);
    
    if (detectedPII.length === 0) {
      alert('ℹ️ No PII detected. File appears clean!');
      sanitizedPreview.innerHTML = `<pre>${escapeHtml(currentFileContent)}</pre>`;
      sanitizedContent = currentFileContent;
      downloadBtn.disabled = false;
      return;
    }
    
    const sortedPII = [...detectedPII].sort((a, b) => b.index - a.index);
    let cleanedContent = currentFileContent;
    
    sortedPII.forEach(pii => {
      const before = cleanedContent.substring(0, pii.index);
      const after = cleanedContent.substring(pii.index + pii.length);
      
      if (mode === 'hide') {
        cleanedContent = before + '█'.repeat(pii.length) + after;
      } else if (mode === 'replace') {
        cleanedContent = before + generateFakeData(pii.value, pii.type) + after;
      }
    });
    
    sanitizedContent = cleanedContent;
    sanitizedPreview.innerHTML = `<pre>${escapeHtml(cleanedContent)}</pre>`;
    downloadBtn.disabled = false;
    
    alert(`✓ Successfully cleaned ${detectedPII.length} PII instance(s)!`);
    
  } else if (fileType === 'csv') {
    let cleanedCSV = currentFileContent;
    const lines = cleanedCSV.split('\n');
    let totalReplacements = 0;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      for (const [key, { pattern, type }] of Object.entries(piiPatterns)) {
        pattern.lastIndex = 0;
        
        line = line.replace(pattern, (match) => {
          totalReplacements++;
          
          if (mode === 'hide') {
            return '█'.repeat(match.length);
          } else if (mode === 'replace') {
            return generateFakeData(match, type);
          }
          return match;
        });
      }
      
      lines[i] = line;
    }
    
    sanitizedContent = lines.join('\n');
    sanitizedPreview.innerHTML = csvToTable(sanitizedContent);
    downloadBtn.disabled = false;
    
    if (totalReplacements === 0) {
      alert('ℹ️ No PII detected in CSV.');
    } else {
      alert(`✓ Successfully cleaned ${totalReplacements} PII instance(s)!`);
    }
  }
}

function generateFakeData(original, type) {
  switch (type) {
    case 'SSN':
      return `${randomDigits(3)}-${randomDigits(2)}-${randomDigits(4)}`;
    case 'Phone':
      return `(${randomDigits(3)}) ${randomDigits(3)}-${randomDigits(4)}`;
    case 'Email':
      const domain = original.includes('@') ? original.split('@')[1] : 'example.com';
      return `user${randomDigits(4)}@${domain}`;
    case 'Credit Card':
      return `${randomDigits(4)}-${randomDigits(4)}-${randomDigits(4)}-${randomDigits(4)}`;
    case 'ZIP Code':
      return original.length > 5 ? `${randomDigits(5)}-${randomDigits(4)}` : randomDigits(5);
    case 'IP Address':
      return `${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
    case 'Date of Birth':
      return `${randomDigits(2)}/${randomDigits(2)}/${randomDigits(4)}`;
    case 'Street Address':
      return `${randomInt(100, 9999)} ${randomLetters(1)}${randomLetters(1).toLowerCase()} St`;
    default:
      return original.split('').map(char => {
        if (/\d/.test(char)) return Math.floor(Math.random() * 10);
        if (/[a-z]/.test(char)) return String.fromCharCode(97 + Math.floor(Math.random() * 26));
        if (/[A-Z]/.test(char)) return String.fromCharCode(65 + Math.floor(Math.random() * 26));
        return char;
      }).join('');
  }
}

function randomDigits(count) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join('');
}

function randomLetters(count) {
  return Array.from({ length: count }, () => 
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join('');
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function downloadSanitizedFile() {
  if (!sanitizedContent) {
    alert('No sanitized content to download.');
    return;
  }

  const blob = fileType === 'image' 
    ? dataURItoBlob(sanitizedContent)
    : new Blob([sanitizedContent], { type: 'text/plain' });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sanitized_${currentFileName}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('Downloaded:', `sanitized_${currentFileName}`);
}

function dataURItoBlob(dataURI) {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showPreview() {
  uploadZone.classList.add('hidden');
  mainContainer.classList.add('active');
  console.log('Preview shown');
}

console.log('Sanitizer loaded and ready');
