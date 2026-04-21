fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identificacion: 'admin', password: 'admin' })
}).then(r => r.json()).then(console.log).catch(console.error);
