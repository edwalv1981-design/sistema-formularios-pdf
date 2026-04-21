const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'public', 'js', 'app.js');
let content = fs.readFileSync(filePath, 'utf8');

// Eliminar escapes incorrectos que se colaron durante las ediciones
content = content.replace(/\\`/g, '`');
content = content.replace(/\\\${/g, '${');

fs.writeFileSync(filePath, content);
console.log('Fichero public/js/app.js limpiado de errores de sintaxis.');
