async function checkLogin() {
    const creds = [
        { identificacion: 'admin', password: 'admin' },
        { identificacion: '1713470050', password: 'Admin.2024*' }
    ];
    for (const c of creds) {
        try {
            const res = await fetch('http://localhost:3000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(c)
            });
            const data = await res.json();
            console.log(`Testing ${c.identificacion}: ${res.status}`, data);
        } catch (e) {
            console.log(`Testing ${c.identificacion}: FAIL`, e.message);
        }
    }
}
checkLogin();
